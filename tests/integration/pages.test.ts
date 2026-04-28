import { getContainerRenderer as vueContainerRenderer } from "@astrojs/vue";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { afterEach, describe, it, expect, vi } from "vitest";

import Auth from "../../src/layouts/Auth.astro";
import Base from "../../src/layouts/Base.astro";

describe("Base layout", () => {
  it("title を受け取って HTML に含める", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Base, {
      props: { title: "テストタイトル" },
      slots: { default: "<p>本文</p>" },
    });

    expect(result).toContain("<title>テストタイトル</title>");
    expect(result).toContain("<p>本文</p>");
  });

  it("description を meta タグに含める", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Base, {
      props: { title: "t", description: "テスト説明" },
      slots: { default: "" },
    });

    expect(result).toContain('content="テスト説明"');
  });
});

describe("Base layout — noIndex meta (Issue #70)", () => {
  // 認証必須エリア / 認証フローページは検索エンジンにインデックスされないように
  // <meta name="robots" content="noindex, nofollow"> を出す。robots.txt と
  // @astrojs/sitemap filter に加えた 3 層目の防御。
  const NOINDEX_META_RE =
    /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/;

  it("noIndex 未指定時は robots meta を出さない (一般公開ページ)", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Base, {
      props: { title: "公開ページ" },
      slots: { default: "<p>x</p>" },
    });

    expect(result).not.toMatch(NOINDEX_META_RE);
  });

  it("noIndex=true で robots meta が出る", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Base, {
      props: { title: "非公開ページ", noIndex: true },
      slots: { default: "<p>x</p>" },
    });

    expect(result).toMatch(NOINDEX_META_RE);
  });

  it("Auth レイアウトは noIndex を渡している (signin / signup / reset-password 等)", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Auth, {
      props: { title: "サインイン" },
      slots: { default: "<form />" },
    });

    expect(result).toMatch(NOINDEX_META_RE);
  });
});

describe("signin / signup pages — Google OAuth opt-in (Issue #49 / PR 3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Astro Actions の `actions.auth.signInWithGoogle` は form の action prop に
  // 渡されると `?_action=auth.signInWithGoogle` (current URL + query) に展開される
  // (Astro の自然な書き分け: 同一 URL POST + query で action 識別)。
  // 別途 worker test (`tests/workers/csrf.test.ts`) では `/_actions/...` の
  // 直接 POST も同等にハンドルされ CSRF guard が効くことを検証している。
  const GOOGLE_BUTTON_FORM_RE =
    /<form[^>]+action="\?_action=auth\.signInWithGoogle"/;

  it("signin.astro: PUBLIC_GOOGLE_AUTH_ENABLED 未設定では Google ボタンが描画されない (デフォルト OFF)", async () => {
    // 明示的に false を入れて build inline 値を上書き。
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "false");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SigninPage } =
      await import("../../src/pages/auth/signin.astro");
    const result = await container.renderToString(SigninPage);

    expect(result).not.toMatch(GOOGLE_BUTTON_FORM_RE);
    expect(result).not.toContain("Google でサインイン");
  });

  it("signin.astro: PUBLIC_GOOGLE_AUTH_ENABLED=true で Google ボタン form が描画される (action + next hidden field 含む)", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SigninPage } =
      await import("../../src/pages/auth/signin.astro");
    const result = await container.renderToString(SigninPage);

    expect(result).toMatch(GOOGLE_BUTTON_FORM_RE);
    expect(result).toContain("Google でサインイン");
    // next hidden field がデフォルト fallback (/member/dashboard) で埋まる
    expect(result).toMatch(
      /<input[^>]+type="hidden"[^>]+name="next"[^>]+value="\/member\/dashboard"/,
    );
    // POST メソッド指定であること（GET だと CSRF / プリフェッチで意図せず Action が起動する）
    expect(result).toMatch(
      /<form[^>]+method="POST"[^>]+action="\?_action=auth\.signInWithGoogle"|<form[^>]+action="\?_action=auth\.signInWithGoogle"[^>]+method="POST"/,
    );
  });

  it("signin.astro: ?next=/member/profile を渡すと hidden field に safeNextPath 適用後の値が載る", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SigninPage } =
      await import("../../src/pages/auth/signin.astro");
    const result = await container.renderToString(SigninPage, {
      request: new Request(
        "https://example.com/auth/signin?next=/member/profile",
      ),
    });

    expect(result).toMatch(
      /<input[^>]+type="hidden"[^>]+name="next"[^>]+value="\/member\/profile"/,
    );
  });

  it("signin.astro: ?next=//evil.com を渡しても safeNextPath で fallback (/member/dashboard) に正規化される (Open Redirect 防御)", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SigninPage } =
      await import("../../src/pages/auth/signin.astro");
    const result = await container.renderToString(SigninPage, {
      request: new Request(
        "https://example.com/auth/signin?next=//evil.example.com/x",
      ),
    });

    expect(result).toMatch(
      /<input[^>]+type="hidden"[^>]+name="next"[^>]+value="\/member\/dashboard"/,
    );
    expect(result).not.toContain("evil.example.com");
  });

  it("signup.astro: PUBLIC_GOOGLE_AUTH_ENABLED 未設定では Google ボタンが描画されない", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "false");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SignupPage } =
      await import("../../src/pages/auth/signup.astro");
    const result = await container.renderToString(SignupPage);

    expect(result).not.toMatch(GOOGLE_BUTTON_FORM_RE);
    expect(result).not.toContain("Google で新規登録");
  });

  it("signup.astro: PUBLIC_GOOGLE_AUTH_ENABLED=true で Google ボタン form が描画される", async () => {
    vi.stubEnv("PUBLIC_GOOGLE_AUTH_ENABLED", "true");
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    const { default: SignupPage } =
      await import("../../src/pages/auth/signup.astro");
    const result = await container.renderToString(SignupPage);

    expect(result).toMatch(GOOGLE_BUTTON_FORM_RE);
    expect(result).toContain("Google で新規登録");
  });
});

describe("/robots.txt endpoint (Issue #70 — dynamic from PUBLIC_SITE_URL)", () => {
  // 静的 public/robots.txt から src/pages/robots.txt.ts に切替えた経緯は
  // PR #82 Codex review iteration-1 を参照: PUBLIC_SITE_URL と Sitemap: 行が
  // ロックステップで更新されないと独自ドメイン運用で壊れるため、Astro 公式の
  // 動的生成パターンに合わせた。
  it("Astro.site から /sitemap-index.xml URL を導出して robots.txt を返す", async () => {
    const { GET } = await import("../../src/pages/robots.txt");
    const site = new URL("https://example.com/");
    const response = await GET({ site } as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Disallow: /member/");
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Disallow: /auth/");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Sitemap: https://example.com/sitemap-index.xml");
  });

  it("PUBLIC_SITE_URL を変えると Sitemap: 行も追従する (lockstep 整合)", async () => {
    const { GET } = await import("../../src/pages/robots.txt");
    const site = new URL("https://app.acme.test/");
    const response = await GET({ site } as Parameters<typeof GET>[0]);

    const body = await response.text();
    expect(body).toContain("Sitemap: https://app.acme.test/sitemap-index.xml");
    expect(body).not.toContain("example.com");
    expect(body).not.toContain("your-subdomain.workers.dev");
  });

  it("site が undefined のときは 500 を返す (crawler に壊れた robots を渡さない)", async () => {
    const { GET } = await import("../../src/pages/robots.txt");
    const response = await GET({ site: undefined } as Parameters<
      typeof GET
    >[0]);

    expect(response.status).toBe(500);
  });
});

describe("Index page (developer LP, Issue #87)", () => {
  // top page は Claude Code 前提の開発者向け LP。テンプレ利用者は最終的に
  // src/pages/index.astro を自プロダクトの LP に差し替える前提で、最上部に
  // 常設バナーを置いている。

  it("Hero に Claude Code とテンプレートを差し替える趣旨が含まれる", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    expect(result).toContain("Claude Code");
    expect(result).toContain("置き換えてください");
    expect(result).toContain("src/pages/index.astro");
  });

  it("What's inside で RLS / CSRF / Codex / DB 7 ステップに触れる", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    expect(result).toContain("RLS");
    expect(result).toContain("CSRF");
    expect(result).toContain("Codex");
    // 7 ステップは数字とテキストの両方を保持してコピー揺れを検知
    expect(result).toMatch(/7\s*ステップ/);
  });

  it("Use this template / README / GitHub への導線が出力される", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    expect(result).toContain(
      "https://github.com/fune-gaku/member-site-template-public/generate",
    );
    expect(result).toContain(
      "https://github.com/fune-gaku/member-site-template-public/blob/main/README.md",
    );
    expect(result).toContain(
      "https://github.com/fune-gaku/member-site-template-public",
    );
  });

  it("動くデモを見るセクションに signup / signin の既存導線が残る", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    expect(result).toContain('href="/auth/signup"');
    expect(result).toContain('href="/auth/signin"');
  });

  it("見出しは h1 が 1 個で h1→h2→h3 の階層を skip しない (a11y, WCAG 2.1 SC 1.3.1)", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    // 全 heading を出現順に列挙し、レベルだけ取り出す。
    const levels = Array.from(result.matchAll(/<h([1-6])\b/g)).map((m) =>
      Number(m[1]),
    );

    // h1 はちょうど 1 個 (LP の主見出しは Hero の "Claude Code で..." だけ)
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    // 最初の見出しは h1
    expect(levels[0]).toBe(1);
    // h4 / h5 / h6 は使わない (このページには h1〜h3 で十分構造化できる前提)
    expect(levels.filter((l) => l >= 4)).toHaveLength(0);
    // 任意の隣接ペアでレベルを 2 段階以上 jump しない
    // (h2 の直後に h4 みたいに親レベルを skip しない)
    for (let i = 1; i < levels.length; i++) {
      const jump = levels[i] - levels[i - 1];
      expect(jump).toBeLessThanOrEqual(1);
    }
  });
});
