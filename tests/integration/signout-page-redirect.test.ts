import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

// Issue #34: `Astro.redirect()` は page-level (src/pages/**/*.astro) からの return
// でしか作用しない。layout から return しても無視されて空ページになる。
// `/member/dashboard` は page-level の早期 return を持っていたが、
// `/member/profile` / `/member/data` / `/admin/users` には無かったため、
// signOut Action 完了後に空白ページが返るバグが発生していた（#34）。
//
// このテストは、認証必須エリアの全 page が signOut Action 成功時に
// `/` へ早期 return する pattern を「ソース上に保持していること」を grep で保証する。
// 実際の HTTP 動作（302 + Location: /）は手動 / E2E 経路で確認する前提。
const PAGES_TO_CHECK = [
  "src/pages/member/dashboard.astro",
  "src/pages/member/profile.astro",
  "src/pages/member/data.astro",
  "src/pages/admin/users.astro",
] as const;

const REPO_ROOT = resolve(__dirname, "../..");

describe("page-level signOut redirect (Issue #34)", () => {
  it.each(PAGES_TO_CHECK)(
    "%s: signOut Action 成功時に / へ early return する page-level guard を持つ",
    (pagePath) => {
      const source = readFileSync(resolve(REPO_ROOT, pagePath), "utf8");

      const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---/);
      expect(
        frontmatterMatch,
        `${pagePath} に Astro frontmatter が見つからない`,
      ).not.toBeNull();
      const frontmatter = frontmatterMatch![1];

      // 1) actions import がある
      expect(frontmatter).toMatch(
        /import\s*\{[^}]*\bactions\b[^}]*\}\s*from\s*["']astro:actions["']/,
      );
      // 2) signOut の getActionResult を frontmatter で読んでいる
      expect(frontmatter).toMatch(
        /Astro\.getActionResult\(\s*actions\.auth\.signOut\s*\)/,
      );
      // 3) 成功時に "/" へ return Astro.redirect する
      expect(frontmatter).toMatch(
        /return\s+Astro\.redirect\(\s*["']\/["']\s*\)/,
      );
    },
  );

  it.each(["src/layouts/Member.astro", "src/layouts/Admin.astro"] as const)(
    "%s: layout からの dead な Astro.redirect が残っていない",
    (layoutPath) => {
      const source = readFileSync(resolve(REPO_ROOT, layoutPath), "utf8");
      const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1];

      // layout の frontmatter で `return Astro.redirect(...)` を実行している
      // と、Astro 公式仕様で無視されるが「動いているように見える」コードになり
      // 再発の温床になる。コメント中の言及（説明用）は許可するため、`return`
      // を伴う実コードのみを検出する。
      const codeOnly = frontmatter
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(codeOnly).not.toMatch(/return\s+Astro\.redirect\(/);
    },
  );
});
