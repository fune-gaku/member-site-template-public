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
 * **注意**: asymmetric mode のとき local 検証になるため、サーバ側の
 * セッション失効 / アカウント停止 / 強制ログアウトは JWT 寿命 (≒1h) まで
 * 反映されない。admin 操作のように **失効を即時反映する必要がある経路** では
 * `getAuthUserFresh()` を使うこと。
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

/**
 * 強制的に Auth サーバへ問い合わせて JWT を検証する版。
 *
 * `auth.getUser()` を毎回叩く。Auth サーバ側で JWT 署名 + `auth.users` レコードの
 * 状態 (有効 / 削除 / 停止) を検証するため、`getAuthUser` (= `getClaims` の
 * asymmetric mode ローカル検証) と比べて以下が **即時反映** される:
 *
 * - アカウントの **削除** (`auth.users` の row がなくなる)
 * - アカウントの **停止 / banned** (Auth サーバがエラーを返す)
 * - 不正な JWT 署名 (asymmetric mode でも server 検証を再実施)
 *
 * **重要 (公式仕様)**: 別端末からの **sign-out (= `auth.sessions` 削除)** や
 * セッション失効そのものは、`getUser()` でも **JWT 寿命までは検出されない**。
 * これは Supabase の設計上の挙動 (sign-out は refresh_token を無効化するが
 * 既発行 JWT の寿命は変わらない)。完全な失効反映が必要なら別途
 * `auth.sessions` テーブルの `session_id` 存在確認が必要 (= 公式推奨パターン、
 * Issue #23 で別途追跡)。
 *
 * 用途 (本テンプレでの妥協点):
 * - admin Action 全般 (盗難 admin JWT が account 停止後も使えてしまう状態を防ぐ)
 * - middleware の `/admin/*` 経路ガード
 *
 * 一般 member 経路は `getAuthUser()` で十分 (失効ラグは JWT 寿命まで許容、
 * 自分のデータ操作のみで横移動なし)。
 *
 * 代償: 1 リクエストあたり Auth サーバへの往復が 1 回。admin 操作は頻度が
 * 低いので許容。
 *
 * @see https://supabase.com/docs/guides/auth/sessions
 */
export async function getAuthUserFresh(
  supabase: SupabaseClient,
): Promise<AuthUser | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : undefined,
  };
}
