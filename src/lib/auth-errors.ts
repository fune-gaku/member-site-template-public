/**
 * Issue #8 (A3): アカウント列挙対策。
 *
 * `signInWithPassword` の失敗ケース（存在しないユーザー / 間違ったパスワード /
 * `Email not confirmed` 等）はすべてこの統一メッセージで応答し、
 * 攻撃者がメールアドレスの存在有無を判定できないようにする。
 *
 * 真の防衛線は本定数を参照する Astro Action 側のエラーハンドリング。
 * 元エラーは call site で `console.error` に落とし、Workers Logs から
 * 運用観察できるようにする。
 *
 * @see https://owasp.org/www-community/attacks/Account_Enumeration
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages
 */
export const SIGNIN_GENERIC_ERROR_MESSAGE =
  "メールアドレスまたはパスワードが正しくありません";
