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
