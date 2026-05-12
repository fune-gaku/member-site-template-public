import { ActionError } from "astro:actions";

import { RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE } from "./auth-errors";
import { logger } from "./logger";

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
 * 元エラーは `logger.error` に落とし、PII（email / JWT）をマスクした上で
 * Workers Logs から運用観察できるようにする (Issue #7)。
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
 */

interface ResetPasswordInput {
  email: string;
  options: {
    redirectTo: string;
  };
}

export interface ResetPasswordCapableClient {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string },
    ) => Promise<{ error: { message: string; code?: string } | null }>;
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
    });
    if (error) {
      logger.error(
        "auth.resetPassword error (suppressed for enumeration)",
        error,
      );
    }
  } catch (e) {
    if (e instanceof ActionError) throw e;
    logger.error("auth.resetPassword unexpected (suppressed)", e);
  }
  return {
    success: true,
    message: RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE,
  };
}
