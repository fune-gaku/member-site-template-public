import { ActionError } from "astro:actions";

/**
 * Issue #49: Google OAuth ログイン (PKCE フロー) の Action 本体を Astro 依存の
 * 薄ラッパから分離し、純関数的にテスト可能な形に切り出した実装。
 *
 * Supabase の `signInWithOAuth({ provider: 'google', options: { redirectTo } })`
 * は **server 側で消費可能な authorization URL** を返す（PKCE の verifier は
 * Supabase Auth サーバ側に保管され、code 交換は `/auth/callback` の
 * `exchangeCodeForSession` で行う）。本関数は URL を取り出して caller に渡すだけ。
 *
 * 失敗時は内部詳細を表に出さず、汎用エラーで `ActionError` を投げる。
 *
 * @see https://supabase.com/docs/guides/auth/social-login/auth-google?framework=astro
 * @see https://supabase.com/docs/reference/javascript/auth-signinwithoauth
 */

export const GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE =
  "Google サインインを開始できませんでした。もう一度お試しください。";

export interface SignInWithGoogleCapableClient {
  auth: {
    signInWithOAuth(input: {
      provider: "google";
      options: { redirectTo: string };
    }): Promise<{
      data: { url: string | null; provider?: string } | null;
      error: { message: string; code?: string } | null;
    }>;
  };
}

interface SignInWithGoogleInput {
  redirectTo: string;
}

export async function performSignInWithGoogle(
  supabase: SignInWithGoogleCapableClient,
  input: SignInWithGoogleInput,
): Promise<{ url: string }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: input.redirectTo },
  });
  if (error || !data?.url) {
    console.error(
      "auth.signInWithGoogle error:",
      error ?? new Error("signInWithOAuth returned no url"),
    );
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: GOOGLE_OAUTH_GENERIC_ERROR_MESSAGE,
    });
  }
  return { url: data.url };
}

/**
 * `PUBLIC_GOOGLE_AUTH_ENABLED` の opt-in 判定。完全一致 `"true"` のみ true を返す。
 * `"True"` / `"1"` / 空文字 / undefined はすべて false（fail-closed）。
 *
 * 多層防御の 1 層: Action handler で false なら `NOT_FOUND` を投げて Action 自体を
 * 隠蔽し、env が漏れている環境で攻撃者が Action 経由の OAuth トリガを叩けないようにする。
 */
export function isGoogleAuthEnabled(flag: string | undefined): boolean {
  return flag === "true";
}
