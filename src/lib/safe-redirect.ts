/**
 * Open Redirect 対策: `next` クエリパラメータをサニタイズする。
 *
 * 許可するのは「/ で始まり、// では始まらない、スキームを含まないパス」のみ。
 * - "/member/dashboard" → そのまま返す
 * - "//evil.example.com" → fallback を返す（protocol-relative URL 攻撃の防止）
 * - "https://evil" → fallback（絶対 URL の防止）
 * - "javascript:alert(1)" → fallback（JS スキーム実行の防止）
 * - "\\evil" → fallback（バックスラッシュを / に解釈するブラウザ対策）
 *
 * CWE-601 / OWASP "Unvalidated Redirects and Forwards" 準拠。
 *
 * @param rawNext URL クエリから取得した生の next 値（null / undefined を許容）
 * @param fallback 不正値だった場合に返すデフォルトパス
 * @returns 同一オリジン内で安全に遷移できる絶対パス
 */
export function safeNextPath(
  rawNext: string | null | undefined,
  fallback = "/member/dashboard",
): string {
  if (!rawNext) return fallback;

  // 制御文字・前後空白を除去
  const trimmed = rawNext.trim();
  if (!trimmed) return fallback;

  // "/" で始まり、かつ "//" と "/\" では始まらないこと
  // （protocol-relative URL "//evil.example.com" や
  //   Windows 系ブラウザが "/" と解釈する "/\evil" を弾く）
  if (!/^\/[^/\\]/.test(trimmed)) return fallback;

  // 念のためスキーム混入を弾く（"/foo?x=https:..." 自体は OK なので完全 URL パースはしない）
  if (/^\s*[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;

  return trimmed;
}
