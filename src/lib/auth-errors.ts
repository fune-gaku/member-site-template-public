/**
 * Issue #8 (A3) / #14 (signUp / resetPassword follow-up):
 * アカウント列挙対策のためのユーザー向け統一メッセージ。
 *
 * 認証系 Action の失敗時に内部理由（存在しないメール / 間違ったパスワード /
 * 既登録メール / SMTP エラー / レート上限など）を露出させると、攻撃者が
 * メールアドレスの存在判定や、登録状態を推測できてしまうため、ユーザー向け
 * 応答はすべて成否非依存の固定文言に正規化する。
 *
 * 真の防衛線は本定数を参照する Astro Action / perform* ヘルパー側の
 * エラーハンドリング。元エラーは call site で `console.error` に落とし、
 * Workers Logs から運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
 */

/**
 * `auth.signIn` Action 失敗時の統一メッセージ（UNAUTHORIZED）。
 */
export const SIGNIN_GENERIC_ERROR_MESSAGE =
  "メールアドレスまたはパスワードが正しくありません";

/**
 * `auth.signUp` Action 成功扱い時の統一メッセージ。
 *
 * 既登録メールでも未登録メールでも同じ文言を返し、登録有無を判定不能にする。
 * 既登録の場合 Supabase の挙動: confirmation email は再送されないが、
 * UI には「送信したかもしれない」という不確実性を残す。
 */
export const SIGNUP_GENERIC_SUCCESS_MESSAGE =
  "確認メールを送信しました。メール内のリンクをクリックして登録を完了してください（既にご登録済みの場合はメールが届かないことがあります）。";

/**
 * `auth.resetPassword` Action 成功扱い時の統一メッセージ。
 *
 * 未登録メール / 内部 SMTP 失敗 / レート超過いずれの場合も同文を返す。
 * Supabase は通常未登録メールでも 200 を返すため、本文言で「実際に送ったかどうか」
 * を曖昧化する OWASP Forgot Password Cheat Sheet の推奨に沿う。
 */
export const RESET_PASSWORD_GENERIC_SUCCESS_MESSAGE =
  "ご登録のメールアドレス宛にパスワード再設定用のリンクを送信しました。届いていない場合はアカウントが未登録の可能性があります。";

/**
 * Issue #52: Cloudflare Turnstile 検証が Supabase Auth (GoTrue) で失敗したとき
 * (`error.code === "captcha_failed"`) のユーザー向けメッセージ。
 *
 * これは enumeration vector ではない（bot 検知失敗であってアカウント存在判定
 * ではない）ため、`signIn` / `signUp` / `resetPassword` の統一応答とは分離して
 * 個別の `BAD_REQUEST` で返し、ユーザーに actionable な instruction を出す。
 */
export const CAPTCHA_FAILED_MESSAGE =
  "ボット対策の検証に失敗しました。ページを再読み込みしてもう一度お試しください。";
