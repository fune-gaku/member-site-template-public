import { SIGNUP_GENERIC_SUCCESS_MESSAGE } from "./auth-errors";

/**
 * Issue #14 (A3 follow-up): `auth.signUp` Action のアカウント列挙対策実装本体。
 *
 * Supabase の `signUp` は既登録メールに対して `User already registered` 等の
 * エラーを返すため、UI に透過するとメアドの存在判定に使える。すべての失敗ケース
 * （既登録 / SMTP 失敗 / レート超過 / 内部エラー）を統一成功メッセージに
 * 正規化し、攻撃者には登録有無を判定させない。
 *
 * 本ヘルパーが受け持つのは Supabase 呼び出し以降の応答正規化。事前検証
 * （Turnstile / HIBP / Zod スキーマ）は Action 側で先に行い、それらの
 * BAD_REQUEST は通常通りユーザに返す（バリデーション失敗は enumeration
 * vector ではないため）。
 *
 * 元エラーは `console.error` に落とし、Workers Logs から運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
 */

interface SignUpInput {
  email: string;
  password: string;
  options?: {
    emailRedirectTo?: string;
  };
}

export interface SignUpCapableClient {
  auth: {
    signUp(input: SignUpInput): Promise<{
      error: { message: string } | null;
    }>;
  };
}

export interface SignUpResult {
  success: true;
  message: string;
}

export async function performSignUp(
  supabase: SignUpCapableClient,
  input: SignUpInput,
): Promise<SignUpResult> {
  try {
    const { error } = await supabase.auth.signUp(input);
    if (error) {
      // 失敗詳細はログのみ。UI には enumeration を漏らさない統一成功応答を返す。
      console.error("auth.signUp error (suppressed for enumeration):", error);
    }
  } catch (e) {
    // ネットワーク / 例外もログのみで吸収
    console.error("auth.signUp unexpected (suppressed):", e);
  }
  return {
    success: true,
    message: SIGNUP_GENERIC_SUCCESS_MESSAGE,
  };
}
