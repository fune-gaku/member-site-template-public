import { z } from "astro/zod";

/**
 * 共通パスワードポリシースキーマ
 *
 * 要件（NIST SP 800-63B §5.1.1 / OWASP ASVS V2.1 / Supabase Password Security 推奨準拠）:
 * - 8 文字以上（"Anything less than 8 characters is not recommended."）
 * - 72 文字以下（bcrypt の仕様上の最大ペイロード長）
 * - 英大文字・英小文字・数字を各 1 文字以上含む（ASVS L2 相当）
 *
 * 本スキーマは signUp / admin.createUser / updatePassword（Issue #002-B）など、
 * サーバー・クライアント双方のバリデーションで再利用する前提で独立ファイル化している。
 *
 * @see https://supabase.com/docs/guides/auth/password-security
 * @see https://pages.nist.gov/800-63-3/sp800-63b.html#memsecretver
 * @see https://owasp.org/www-project-application-security-verification-standard/
 */
export const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください")
  .max(72, "パスワードは72文字以下で入力してください")
  .refine(
    (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw),
    "英大文字・英小文字・数字を各1文字以上含めてください",
  );

/**
 * クライアント側の早期バリデーション（Vue コンポーネント用）。
 *
 * Zod と同じルールを文字列ベースで判定し、エラーメッセージを返す。
 * 問題なければ null を返す。
 *
 * Zod を使わずに実装しているのは、Vue コンポーネントに astro/zod を
 * バンドルさせないためとフォーム送信前の即時フィードバックを軽量化するため。
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return "パスワードは8文字以上で入力してください";
  }
  if (password.length > 72) {
    return "パスワードは72文字以下で入力してください";
  }
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "英大文字・英小文字・数字を各1文字以上含めてください";
  }
  return null;
}

/** フォーム入力欄に掲示する文言（placeholder / helper 共通）。 */
export const PASSWORD_POLICY_HINT =
  "8文字以上・英大小文字・数字を含む";
