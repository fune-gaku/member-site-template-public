/**
 * HaveIBeenPwned Pwned Passwords API (k-Anonymity) を使って
 * パスワードが既知の漏洩リストに含まれているか確認する。
 *
 * プライバシー配慮: SHA-1 の最初 5 文字のみを API に送る（k-Anonymity モデル）。
 * 残りの 35 文字で自前マッチするため、平文パスワードや完全なハッシュは外部に送られない。
 *
 * 実装メモ:
 * - Cloudflare Workers 互換（`fetch` + `crypto.subtle` のみを使用、Node 依存無し）
 * - API 障害時は **フェイルオープン**（`false` を返して登録をブロックしない）。
 *   可用性を優先する代わりに、Supabase 側の Leaked Password Protection
 *   （Pro プランの Dashboard 設定）と多層防御で担保する想定。
 * - `wrangler.jsonc` の `global_fetch_strictly_public` flag 下でも
 *   `api.pwnedpasswords.com` は公開エンドポイントのため動作する。
 *
 * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
 * @see https://supabase.com/docs/guides/auth/password-security
 */

import { logger } from "./logger";

const HIBP_RANGE_ENDPOINT = "https://api.pwnedpasswords.com/range";

/**
 * 環境変数で HIBP チェックを有効化しているかを返す。
 *
 * デフォルト（未設定 / "false"）は無効。Supabase Free プラン利用者など
 * 個別にオプトインしたい場合のみ `ENABLE_HIBP_CHECK=true` を設定する。
 *
 * Pro プラン以上では Supabase Dashboard の
 * Leaked Password Protection で同等機能が提供されるため、
 * アプリ層での二重チェックは不要。
 */
export function isHibpCheckEnabled(
  flag: string | boolean | undefined,
): boolean {
  if (flag === true) return true;
  if (typeof flag !== "string") return false;
  return flag.toLowerCase() === "true";
}

/**
 * SHA-1 ハッシュを大文字 HEX 文字列で返す（HIBP API の要求形式）。
 *
 * SHA-1 は暗号学的には弱いが、HIBP API が k-Anonymity モデルの
 * インデックスとして公開しているアルゴリズムなので本用途では問題ない
 * （平文保存用の強力ハッシュとしては絶対に使わない）。
 */
async function sha1HexUpper(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * パスワードが HIBP 漏洩リストに含まれるか確認する。
 *
 * @param password 平文パスワード（外部には送らず、先頭 5 文字の SHA-1 プレフィックスのみ送信）
 * @returns 漏洩していれば true。見つからない / API 失敗時は false（フェイルオープン）。
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  let hashHex: string;
  try {
    hashHex = await sha1HexUpper(password);
  } catch (err) {
    // crypto.subtle が使えない環境（想定外）。フェイルオープン。
    logger.error("HIBP: SHA-1 ハッシュ生成に失敗", err);
    return false;
  }

  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  let res: Response;
  try {
    res = await fetch(`${HIBP_RANGE_ENDPOINT}/${prefix}`, {
      // Cloudflare Workers 上でも公開 HTTPS エンドポイントなので global_fetch_strictly_public 下で動作
      headers: { "Add-Padding": "true" },
    });
  } catch (err) {
    // ネットワーク障害 / DNS 失敗など。フェイルオープン。
    logger.error("HIBP: fetch 失敗", err);
    return false;
  }

  if (!res.ok) {
    // API 障害時はフェイルオープン（登録をブロックしない）
    logger.error("HIBP: API がエラーレスポンス", res.status);
    return false;
  }

  let body: string;
  try {
    body = await res.text();
  } catch (err) {
    logger.error("HIBP: レスポンス読み取り失敗", err);
    return false;
  }

  return body
    .split("\n")
    .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
}
