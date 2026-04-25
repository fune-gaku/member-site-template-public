import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, it, expect } from "vitest";

import SignoutPage from "../../src/pages/auth/signout.astro";

// `/auth/signout` は GET / HEAD / その他 safe-method 経路で副作用を起こさないこと、
// および `Allow: POST` を返すことを保証する CSRF 防御の根幹テスト。
// .claude/security.md「CSRF 対策（サインアウト経路）」の手動 3 点検フローのうち、
// 1 点目（GET → 405）を自動化する位置付け。
describe("/auth/signout method guard", () => {
  it.each(["GET", "HEAD", "PUT", "DELETE", "PATCH"] as const)(
    "%s リクエストは 405 Method Not Allowed を返し Allow: POST を含む",
    async (method) => {
      const container = await AstroContainer.create();
      const response = await container.renderToResponse(SignoutPage, {
        request: new Request("https://example.com/auth/signout", { method }),
      });

      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    },
  );
});
