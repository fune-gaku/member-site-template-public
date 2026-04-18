import { getContainerRenderer as vueContainerRenderer } from "@astrojs/vue";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { loadRenderers } from "astro:container";
import { describe, it, expect } from "vitest";

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
