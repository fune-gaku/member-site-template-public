import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, it, expect, vi } from "vitest";

import Error from "../../src/layouts/Error.astro";

// Issue #69: 404 / 500 エラーページの SSR 出力を検証する。
// 受け入れ基準: ファイル存在 + noindex meta + 500 はエラー詳細を漏洩しない。

const NOINDEX_META_RE =
  /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/;

describe("Error layout", () => {
  it("title を受け取って HTML に含める", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Error, {
      props: { title: "テストエラー" },
      slots: { default: "<p>本文</p>" },
    });

    expect(result).toContain("<title>テストエラー</title>");
    expect(result).toContain("<p>本文</p>");
  });

  it("常に noindex meta を出す (Member.astro と同様 noIndex を渡している)", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Error, {
      props: { title: "x" },
      slots: { default: "" },
    });

    expect(result).toMatch(NOINDEX_META_RE);
  });

  it("「トップページに戻る」リンクを含む (認証コンテキスト不要のシンプルな導線)", async () => {
    const container = await AstroContainer.create();
    const result = await container.renderToString(Error, {
      props: { title: "x" },
      slots: { default: "" },
    });

    expect(result).toMatch(/<a[^>]+href="\/"[^>]*>[\s\S]*トップページに戻る/);
  });
});

describe("404 page", () => {
  it("「ページが見つかりません」文言を含み、noindex meta を持つ", async () => {
    const container = await AstroContainer.create();
    const { default: NotFoundPage } = await import("../../src/pages/404.astro");
    const result = await container.renderToString(NotFoundPage);

    expect(result).toContain("ページが見つかりません");
    expect(result).toMatch(NOINDEX_META_RE);
    expect(result).toContain("<title>ページが見つかりません</title>");
  });
});

describe("500 page", () => {
  it("「予期しないエラーが発生しました」文言を含み、noindex meta を持つ", async () => {
    const container = await AstroContainer.create();
    const { default: ServerErrorPage } =
      await import("../../src/pages/500.astro");
    const result = await container.renderToString(ServerErrorPage);

    expect(result).toContain("予期しないエラーが発生しました");
    expect(result).toMatch(NOINDEX_META_RE);
  });

  it("error prop の中身を画面に出さない (情報漏洩防止 / OWASP)", async () => {
    const container = await AstroContainer.create();
    const { default: ServerErrorPage } =
      await import("../../src/pages/500.astro");

    // console.error はサーバログにのみ残し、画面には流出しない契約。
    // 画面側に流出していないことを検証する目的なので、テスト中の noisy 出力を黙らせる。
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const sentinel = "SECRET_DB_CONNECTION_STRING_LEAK_CANARY";
      const result = await container.renderToString(ServerErrorPage, {
        props: { error: new globalThis.Error(sentinel) },
      });

      expect(result).not.toContain(sentinel);
      // stack trace 由来の文字列も漏れていないか念のため確認
      expect(result).not.toMatch(/at\s+.+:\d+:\d+/);
      // console.error には渡されている (Workers Logs での観測経路を保証)
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
