import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 検証済み JWT クレームから取り出してアプリ全体で使う最小プロファイル。
 *
 * Supabase 公式の最新推奨である `auth.getClaims()` を経由して取得する。
 * 全 User オブジェクトを保持しないことで、cookie に乗ってきた値を信頼せず
 * 本当に検証されたフィールドだけを locals / actions に流す方針を表現する。
 */
export interface AuthUser {
  /** JWT `sub` クレーム (= auth.users.id) */
  id: string;
  /** JWT `email` クレーム。プロジェクトが email auth を使わない場合は undefined */
  email?: string;
}

/**
 * アクセストークン JWT を検証して、アプリ向けの最小ユーザー情報を返す。
 *
 * `auth.getClaims()` は Supabase 公式が `getUser()` の上位として推奨する API:
 * - 非対称署名鍵 (RSA / ECC) 設定時は WebCrypto による **ローカル検証**
 *   (JWKS をキャッシュ、Auth サーバへの往復なし)。
 * - 対称鍵設定時は内部で `getUser()` 同等のサーバ検証にフォールバックするため
 *   既存 Supabase プロジェクトでも互換 (Dashboard 設定切替で自動的に高速化)。
 *
 * `getUser()` の置き換え。返り値が `null` のときは未認証として扱う。
 *
 * @see https://supabase.com/docs/reference/javascript/auth-getclaims
 */
export async function getAuthUser(
  supabase: SupabaseClient,
): Promise<AuthUser | null> {
  // SupabaseClient の auth 型に getClaims が無いランタイムを誤検知しないよう
  // 直接呼び出し。@supabase/supabase-js v2.50+ で利用可能。
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const sub = data.claims.sub;
  if (typeof sub !== "string" || sub.length === 0) return null;

  const emailClaim = (data.claims as Record<string, unknown>).email;
  return {
    id: sub,
    email: typeof emailClaim === "string" ? emailClaim : undefined,
  };
}
