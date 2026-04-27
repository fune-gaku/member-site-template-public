import { ActionError } from "astro:actions";

import {
  CAPTCHA_FAILED_MESSAGE,
  RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
} from "./auth-errors";

/**
 * Issue #14 (A3 follow-up): `auth.resetPassword` Action のアカウント列挙対策実装本体。
 *
 * Supabase の `resetPasswordForEmail` は通常未登録メールに対しても 200 を返すため、
 * 既存挙動でも基本的には enumeration safe。ただしレートリミット / 内部 SMTP エラー /
 * 設定不備等が UI に透過するとサイドチャネルになり得るため、すべての失敗ケースを
 * 統一成功メッセージに正規化する。
 *
 * 本ヘルパーが受け持つのは Supabase 呼び出し以降の応答正規化。事前検証
 * （Zod スキーマ）は Action 側で先に行う。
 *
 * Issue #52: Cloudflare Turnstile の検証は Supabase Auth (GoTrue) に委譲する。
 * caller は Action から `captchaToken` を受け取って `options.captchaToken` に
 * 流すだけ。Supabase Auth が CAPTCHA を検証し、失敗時は `error.code === "captcha_failed"`
 * を返してくる。これは enumeration vector ではない（bot 検知失敗）ので、統一
 * 成功応答に巻き込まずに `BAD_REQUEST` で個別エラーとして返す。
 *
 * 元エラーは `console.error` に落とし、Workers Logs から運用観察できるようにする。
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
 * @see https://supabase.com/docs/guides/auth/auth-captcha
 */

interface ResetPasswordInput {
  email: string;
  captchaToken?: string;
  options: {
    redirectTo: string;
  };
}

export interface ResetPasswordCapableClient {
  auth: {
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string; captchaToken?: string },
    ): Promise<{ error: { message: string; code?: string } | null }>;
  };
}

export interface ResetPasswordResult {
  success: true;
  message: string;
}

export async function performResetPassword(
  supabase: ResetPasswordCapableClient,
  input: ResetPasswordInput,
): Promise<ResetPasswordResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.options.redirectTo,
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
    });
    if (error) {
      // CAPTCHA 失敗は統一成功応答 (enumeration 防御) ではなく個別の BAD_REQUEST。
      if (error.code === "captcha_failed") {
        console.error("auth.resetPassword captcha_failed:", error);
        throw new ActionError({
          code: "BAD_REQUEST",
          message: CAPTCHA_FAILED_MESSAGE,
        });
      }
      console.error(
        "auth.resetPassword error (suppressed for enumeration):",
        error,
      );
    }
  } catch (e) {
    // captcha_failed の ActionError は素通しする。それ以外はログのみで吸収。
    if (e instanceof ActionError) throw e;
    console.error("auth.resetPassword unexpected (suppressed):", e);
  }
  return {
    success: true,
    message: RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
  };
}
