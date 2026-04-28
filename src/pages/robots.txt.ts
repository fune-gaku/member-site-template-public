import type { APIRoute } from "astro";

// Issue #70 / PR #82 Codex review iteration-1:
// 静的 public/robots.txt だと PUBLIC_SITE_URL を変えても Sitemap: 行が
// テンプレ固定 URL を指し続け、独自ドメイン運用で sitemap が発見されない
// 不具合 (lockstep 違反) が起きる。Astro 公式が「site 値を再利用したい場合は
// robots.txt を動的生成せよ」と明示しているのでこのパターンに合わせる。
//   https://docs.astro.build/en/guides/integrations-guide/sitemap/#sitemap-link-in-robotstxt
//
// 多層防御 (robots.txt + sitemap filter + <meta name="robots" noindex>) の 1 層。
// PUBLIC_SITE_URL の単一ソースから sitemap URL も Disallow も派生させる。

// build 時に静的アセットとして焼き出す。robots.txt は per-request 計算する
// 必要が無く、エッジで CDN 配信する方がレイテンシ的にも費用的にも有利。
export const prerender = true;

const buildRobotsTxt = (sitemapUrl: URL): string =>
  `User-agent: *
Disallow: /member/
Disallow: /admin/
Disallow: /auth/
Allow: /

Sitemap: ${sitemapUrl.href}
`;

export const GET: APIRoute = ({ site }) => {
  // astro.config.mjs で site を必須にしているため通常 undefined にはならないが
  // 万一未設定で実行された場合に備えて明示エラーにする (silent fallback で
  // crawler に壊れた robots.txt を渡さない)。
  if (!site) {
    return new Response("site is not configured in astro.config.mjs", {
      status: 500,
    });
  }
  const sitemapUrl = new URL("sitemap-index.xml", site);
  return new Response(buildRobotsTxt(sitemapUrl), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
