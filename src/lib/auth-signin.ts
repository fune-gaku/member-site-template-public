import { ActionError } from "astro:actions";

import {
  CAPTCHA_FAILED_MESSAGE,
  SIGNIN_GENERIC_ERROR_MESSAGE,
} from "./auth-errors";

/**
 * Issue #8 (A3): `auth.signIn` Action の振る舞いを Astro 依存の薄ラッパから
 * 分離し、純関数的にテスト可能な形に切り出した実装本体。
 *
 * Supabase の `signInWithPassword` が返す失敗ケース
 * （存在しないユーザー / 間違ったパスワード / `Email not confirmed` 等）を
 * すべて `UNAUTHORIZED` + 統一メッセージに正規化する。
 *
 * Issue #52: Cloudflare Turnstile の検証は Supabase Auth (GoTrue) に委譲する。
 * caller は Action から `captchaToken` を受け取って `options.captchaToken` に
 * 流すだけ。Supabase Auth が CAPTCHA を検証し、失敗時は HTTP 400 +
 * `error.code === "captcha_failed"` (`@supabase/auth-js` の `ErrorCode` 型に
 * 含まれる) を返してくる。これは enumeration vector ではない（攻撃者が見ている
 * のは bot 検知失敗であってアカウント存在判定ではない）ため、統一応答に
 * 巻き込まずに `BAD_REQUEST` で個別エラーとして返し、UI で「もう一度
 * チャレンジを完了してください」と促す。
 *
 * 元エラーは `console.error` に落とし、Workers Logs から運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 * @see https://supabase.com/docs/guides/auth/auth-captcha
 */

interface SignInInput {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface SignInCapableClient {
  auth: {
    signInWithPassword(input: {
      email: string;
      password: string;
      options?: { captchaToken?: string };
    }): Promise<{
      error: { message: string; code?: string } | null;
    }>;
  };
}

export async function performSignIn(
  supabase: SignInCapableClient,
  input: SignInInput,
): Promise<{ success: true }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
    options: input.captchaToken
      ? { captchaToken: input.captchaToken }
      : undefined,
  });
  if (error) {
    // CAPTCHA 失敗は統一応答 (enumeration 防御) ではなく個別の BAD_REQUEST。
    // 攻撃者にもユーザーにも同じ「bot 検知失敗」として返ればよい。
    if (error.code === "captcha_failed") {
      console.error("auth.signIn captcha_failed:", error);
      throw new ActionError({
        code: "BAD_REQUEST",
        message: CAPTCHA_FAILED_MESSAGE,
      });
    }
    console.error("auth.signIn error:", error);
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: SIGNIN_GENERIC_ERROR_MESSAGE,
    });
  }
  return { success: true };
}
