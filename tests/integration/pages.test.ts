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

describe("Auth layout — Turnstile loader opt-in (PR #32 / Issue #31)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const TURNSTILE_PRECONNECT_RE =
    /<link[^>]+rel="preconnect"[^>]+href="https:\/\/challenges\.cloudflare\.com"/;
  // 属性の出現順は Astro の emit 仕様で前後しうるため、同一 tag 内に
  // marker + src を順序非依存で含むかは個別 match で検証する。
  const TURNSTILE_SCRIPT_TAG_RE =
    /<script\b[^>]*\bdata-turnstile-loader="true"[^>]*>/;

  it("enableTurnstile=true かつ PUBLIC_TURNSTILE_SITE_KEY 設定時のみ <head> に preconnect + loader script を出力する", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "0xTEST_SITE_KEY");

    const container = await AstroContainer.create();
    const result = await container.renderToString(Auth, {
      props: { title: "サインイン", enableTurnstile: true },
      slots: { default: "<form />" },
    });

    expect(result).toMatch(TURNSTILE_PRECONNECT_RE);
    // preconnect は crossorigin 属性を付けない (公式例に揃える)
    const preconnectTag = result.match(
      /<link[^>]+rel="preconnect"[^>]+challenges\.cloudflare\.com[^>]*>/,
    )?.[0];
    expect(preconnectTag).toBeDefined();
    expect(preconnectTag).not.toContain("crossorigin");

    // loader script: marker / src の URL 要素 / defer / async 非付与 をまとめて検証
    const scriptTag = result.match(TURNSTILE_SCRIPT_TAG_RE)?.[0];
    expect(scriptTag).toBeDefined();
    expect(scriptTag).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    );
    expect(scriptTag).toContain("render=explicit");
    expect(scriptTag).toContain("onload=onTurnstileReady");
    expect(scriptTag).not.toMatch(/\sasync(\s|>|=)/);
    expect(scriptTag).toMatch(/\sdefer(\s|>|=)/);
  });

  it("enableTurnstile=true でも PUBLIC_TURNSTILE_SITE_KEY が空なら opt-in 維持で何も出力しない", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "");

    const container = await AstroContainer.create();
    const result = await container.renderToString(Auth, {
      props: { title: "サインイン", enableTurnstile: true },
      slots: { default: "<form />" },
    });

    expect(result).not.toMatch(TURNSTILE_PRECONNECT_RE);
    expect(result).not.toMatch(/data-turnstile-loader/);
    expect(result).not.toContain("challenges.cloudflare.com");
  });

  it("enableTurnstile を渡さない (= confirm / update-password など) ページでは site key 設定済でも何も出力しない", async () => {
    vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", "0xTEST_SITE_KEY");

    const container = await AstroContainer.create();
    const result = await container.renderToString(Auth, {
      props: { title: "メール確認" },
      slots: { default: "<p>確認中</p>" },
    });

    expect(result).not.toMatch(TURNSTILE_PRECONNECT_RE);
    expect(result).not.toMatch(/data-turnstile-loader/);
    expect(result).not.toContain("challenges.cloudflare.com");
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

describe("Index page with Vue component", () => {
  it("Vue renderer を含むコンテナで top page が描画される", async () => {
    const renderers = await loadRenderers([vueContainerRenderer()]);
    const container = await AstroContainer.create({ renderers });

    // index.astro を import してレンダリング
    const { default: IndexPage } = await import("../../src/pages/index.astro");
    const result = await container.renderToString(IndexPage);

    // ログイン・サインアップの導線があること
    expect(result.toLowerCase()).toMatch(
      /sign[-\s]?(in|up)|ログイン|サインアップ/,
    );
  });
});
