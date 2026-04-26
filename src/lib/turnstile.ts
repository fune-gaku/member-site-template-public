/**
 * Cloudflare Turnstile (CAPTCHA) のサーバ側検証。
 *
 * 設計方針:
 * - HIBP (`pwned-password.ts`) と同じく env による opt-in。
 *   `PUBLIC_TURNSTILE_SITE_KEY` と `TURNSTILE_SECRET_KEY` の両方が
 *   設定されているときのみ有効化する。片方欠落は無効扱い。
 * - HIBP と違って **フェイルクローズ**: siteverify が失敗 / 応答異常の場合は
 *   bot を素通しさせないため `false` を返し caller 側で 400 を返す。
 *   (Turnstile は bot 対策が目的なので可用性より厳密性を優先)
 * - Cloudflare Workers の `CF-Connecting-IP` を `remoteip` として送り、
 *   token の使い回しを縛る。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * SignupForm が submit に含める hidden input の name (Turnstile 規約)。
 */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

/**
 * Turnstile が両 key 揃って有効化されているかを判定する。
 *
 * site key だけ設定 / secret だけ設定 のような中途半端な状態を
 * 「無効」として扱う方が運用ミスに気付きやすい。
 */
export function isTurnstileEnabled(
  siteKey: string | undefined,
  secret: string | undefined,
): boolean {
  return Boolean(siteKey && secret);
}

interface SiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  challenge_ts?: string;
  action?: string;
  cdata?: string;
}

/**
 * Turnstile siteverify エンドポイントに token を送って検証する。
 *
 * @param token       フロントエンドの widget が発行した token (cf-turnstile-response)
 * @param secret      `TURNSTILE_SECRET_KEY` (サーバ秘密値)
 * @param remoteIp    任意。Cloudflare Workers なら `CF-Connecting-IP` を渡す
 * @returns           検証成功なら `true`、それ以外は全て `false` (fail-closed)
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  secret: string,
  remoteIp?: string,
): Promise<boolean> {
  if (!token || typeof token !== "string" || token.length === 0) {
    return false;
  }

  // Cloudflare 公式は POST + application/x-www-form-urlencoded を推奨
  const body = new URLSearchParams();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  let res: Response;
  try {
    res = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    console.error("Turnstile: fetch 失敗", err);
    return false;
  }

  if (!res.ok) {
    console.error("Turnstile: siteverify がエラーステータス", res.status);
    return false;
  }

  let json: SiteVerifyResponse;
  try {
    json = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    console.error("Turnstile: JSON パース失敗", err);
    return false;
  }

  if (!json.success) {
    console.error("Turnstile: 検証失敗", json["error-codes"] ?? []);
    return false;
  }

  return true;
}
