/**
 * 全ページに適用するセキュリティヘッダ。
 *
 * 設計方針:
 * - Astro + Vue のハイドレーション用インラインスクリプト / スタイルが存在するため
 *   CSP は 'unsafe-inline' を許容する（次フェーズで Astro experimental.csp による
 *   ハッシュ化に移行する前提）
 * - Supabase Storage (*.supabase.co) からの署名付き URL 画像を許可
 * - Supabase Auth / DB / Realtime API への接続（https / wss）を許可
 *
 * 参考:
 * - OWASP Secure Headers Project
 * - Mozilla Observatory
 * - Astro Middleware: https://docs.astro.build/en/guides/middleware/
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策（CSP frame-ancestors と二重化）
  "X-Frame-Options": "DENY",

  // MIME sniffing 対策
  "X-Content-Type-Options": "nosniff",

  // リファラ情報の最小化
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // HTTPS 強制（2 年 + サブドメイン + preload-ready）
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

  // 不要なブラウザ機能を全て拒否（必要に応じて個別に許可へ）
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), " +
    "magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",

  // Cross-Origin-Opener-Policy: ポップアップと元窓の分離
  "Cross-Origin-Opener-Policy": "same-origin",

  // CSP 本体
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    // Astro/Vue のハイドレーションがインライン script/style を出力するため暫定 unsafe-inline
    // TODO: Phase 2 で Astro experimental.csp によるハッシュ化へ移行したら 'unsafe-inline' を削除
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Supabase Auth / REST / Realtime への接続を許可
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "upgrade-insecure-requests",
  ].join("; "),
};

/**
 * 全レスポンスに共通セキュリティヘッダを付与する。
 *
 * 既に同名ヘッダが設定されている場合は尊重する（他 middleware / Cloudflare が
 * 独自のポリシーを入れているケースを考慮）。
 */
export function applySecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) {
      response.headers.set(name, value);
    }
  }
}
