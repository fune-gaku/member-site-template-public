import { ActionError } from "astro:actions";

import { logger } from "./logger";

/**
 * Issue #19: ログイン中ユーザーが自身のパスワードを変更する経路の本体実装。
 *
 * recovery / invite フロー (`auth.updatePassword`) との設計差:
 *   - 現在のパスワードによる再認証を要求する (OWASP Authentication Cheat Sheet /
 *     NIST SP 800-63B §5.2.10)。盗難セッション Cookie 単独での account takeover
 *     と、共有 PC で席を離した隙の攻撃を抑止する。
 *   - 成功後の `signOut` は行わない。recovery と異なりユーザーは現セッションを
 *     維持したいケースが圧倒的多数のため。
 *   - `currentPassword === newPassword` を拒否する。
 *
 * 再認証手段は `auth.signInWithPassword` を流用する。Supabase 公式は password
 * 再認証の専用 API を提供していないため、これが de facto pattern。副作用として
 * 同一ユーザーで新しいセッション Cookie が払い出されるが、本人による即時の
 * パスワード変更経路では無害 (既存セッションが reissue される形)。
 *
 * @see https://supabase.com/docs/reference/javascript/auth-updateuser
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 */

interface ChangePasswordInput {
  email: string;
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordCapableClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<{
      error: { message: string } | null;
    }>;
    updateUser(input: { password: string }): Promise<{
      error: { message: string } | null;
    }>;
  };
}

/** UI に表示する固定メッセージ（テストで参照するため export）。 */
export const CURRENT_PASSWORD_MISMATCH_MESSAGE =
  "現在のパスワードが正しくありません";
export const SAME_AS_CURRENT_PASSWORD_MESSAGE =
  "新しいパスワードは現在のパスワードと異なるものを設定してください";
export const CHANGE_PASSWORD_INTERNAL_ERROR_MESSAGE =
  "パスワードの更新に失敗しました";

export async function performChangePassword(
  supabase: ChangePasswordCapableClient,
  input: ChangePasswordInput,
): Promise<{ success: true }> {
  if (input.currentPassword === input.newPassword) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message: SAME_AS_CURRENT_PASSWORD_MESSAGE,
    });
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.currentPassword,
  });
  if (reauthError) {
    logger.error("auth.changePassword reauth failed", reauthError);
    throw new ActionError({
      code: "BAD_REQUEST",
      message: CURRENT_PASSWORD_MISMATCH_MESSAGE,
    });
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });
  if (updateError) {
    logger.error("auth.changePassword updateUser failed", updateError);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: CHANGE_PASSWORD_INTERNAL_ERROR_MESSAGE,
    });
  }

  return { success: true };
}
