import { ActionError } from "astro:actions";

import { SIGNIN_GENERIC_ERROR_MESSAGE } from "./auth-errors";

/**
 * Issue #8 (A3): `auth.signIn` Action の振る舞いを Astro 依存の薄ラッパから
 * 分離し、純関数的にテスト可能な形に切り出した実装本体。
 *
 * Supabase の `signInWithPassword` が返す失敗ケース
 * （存在しないユーザー / 間違ったパスワード / `Email not confirmed` 等）を
 * すべて `UNAUTHORIZED` + 統一メッセージに正規化する。
 *
 * 元エラーは `console.error` に落とし、Workers Logs から運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 */

interface SignInInput {
  email: string;
  password: string;
}

export interface SignInCapableClient {
  auth: {
    signInWithPassword(input: SignInInput): Promise<{
      error: { message: string } | null;
    }>;
  };
}

export async function performSignIn(
  supabase: SignInCapableClient,
  input: SignInInput,
): Promise<{ success: true }> {
  const { error } = await supabase.auth.signInWithPassword(input);
  if (error) {
    console.error("auth.signIn error:", error);
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: SIGNIN_GENERIC_ERROR_MESSAGE,
    });
  }
  return { success: true };
}
