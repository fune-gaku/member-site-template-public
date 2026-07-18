/**
 * 全ページに適用するセキュリティヘッダ。
 *
 * 設計方針:
 * - script-src / style-src の CSP は astro.config.mjs の `security.csp` 経由で
 *   <meta> として注入する。Astro が bundle した script/style の hash を自動付与
 *   してくれるため 'unsafe-inline' を排除できる。**これらのハッシュ系ディレクティブは
 *   header からは出さない**（header と meta に同じ resource 種別を二重指定すると
 *   両ポリシーが独立評価され、ハッシュ無しの header 側で bundle script/style が
 *   拒否される footgun になる）。
 * - 例外として `frame-ancestors` **だけ** は header で出す。CSP 仕様上
 *   frame-ancestors / report-uri / sandbox は `<meta http-equiv>` では無視され
 *   HTTP header でしか効かない（MDN）。よって meta に書いても死に設定になる。
 *   ここで出す CSP header は frame-ancestors のみで default-src / script-src /
 *   style-src を含まないため、上記 footgun は起きない（script/style は meta 側の
 *   ポリシーだけが制約する）。
 * - X-Frame-Options: DENY も frame-ancestors 'none' の旧ブラウザ向け互換層として
 *   二重で残す（両者は DENY / 'none' で機能的に等価）。
 *
 * 参考:
 * - OWASP Secure Headers Project
 * - Mozilla Observatory
 * - CSP frame-ancestors (header 限定): https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-ancestors
 * - Astro CSP: https://docs.astro.build/en/reference/configuration-reference/#securitycsp
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策（モダン標準）。frame-ancestors は header 限定ディレクティブ
  // のため meta ではなくここで出す。script-src/style-src は含めない（meta 側に集約）。
  "Content-Security-Policy": "frame-ancestors 'none'",

  // クリックジャッキング対策（frame-ancestors 'none' の旧ブラウザ向け互換層）
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
