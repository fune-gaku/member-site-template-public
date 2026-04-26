/**
 * 全ページに適用するセキュリティヘッダ。
 *
 * 設計方針:
 * - CSP は astro.config.mjs の `security.csp` 経由で <meta> として注入する。
 *   Astro が bundle した script/style の hash を自動付与してくれるため
 *   'unsafe-inline' を排除できる。middleware からは CSP を出さない
 *   （header と meta の重複設定は両方が独立評価され、ハッシュなし側で
 *    bundle script が拒否される footgun になる）。
 * - frame-ancestors は CSP 側にあるが、X-Frame-Options も古いブラウザ向けに
 *   二重で残す（無害な互換ヘッダ）。
 *
 * 参考:
 * - OWASP Secure Headers Project
 * - Mozilla Observatory
 * - Astro CSP: https://docs.astro.build/en/reference/configuration-reference/#securitycsp
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策（CSP frame-ancestors の互換層）
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
