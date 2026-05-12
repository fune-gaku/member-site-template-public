/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { exports } from "cloudflare:workers";
import { describe, it, expect } from "vitest";

// Astro `security.checkOrigin`（既定 true）が `_actions/*` への
// クロスオリジン POST を 403 で拒否することを保証する CSRF 防御の根幹テスト。
// .claude/security.md「CSRF 対策（サインアウト経路）」の手動 3 点検フローのうち、
// 2 点目（クロスオリジン POST → 403）と 3 点目（同一オリジン POST 到達）を自動化する位置付け。
//
// 注意: middleware.ts の Content-Length ガード（Issue #9）が CSRF 判定より先に動くため、
// 空 body POST だと 411 が返る可能性がある。最小限の form-encoded body を載せて
// CL ヘッダを fetch に自動付与させ、Astro security middleware まで到達させる。
describe("CSRF: cross-origin POST guard via Astro security.checkOrigin", () => {
  it("クロスオリジン POST /_actions/auth.signOut は 403 を返す", async () => {
    const body = new URLSearchParams();
    const response = await exports.default.fetch(
      "https://member-site-template.your-subdomain.workers.dev/_actions/auth.signOut",
      {
        method: "POST",
        headers: {
          Origin: "https://evil.example.com",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    expect(response.status).toBe(403);
  });

  it("クロスオリジン POST /_actions/auth.signInWithGoogle は 403 を返す (Issue #49)", async () => {
    // Google OAuth トリガ Action もすべての state-changing Action と同様に
    // cross-origin POST から保護されている（Astro security.checkOrigin 経由）。
    // 攻撃者がリンク踏ませで強制 OAuth リダイレクトを起こせないことの回帰テスト。
    const body = new URLSearchParams();
    const response = await exports.default.fetch(
      "https://member-site-template.your-subdomain.workers.dev/_actions/auth.signInWithGoogle",
      {
        method: "POST",
        headers: {
          Origin: "https://evil.example.com",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );

    expect(response.status).toBe(403);
  });

  it("同一オリジン POST /_actions/auth.signOut は 403 を返さない（CSRF を通過する）", async () => {
    const body = new URLSearchParams();
    const url =
      "https://member-site-template.your-subdomain.workers.dev/_actions/auth.signOut";
    const response = await exports.default.fetch(url, {
      method: "POST",
      headers: {
        Origin: "https://member-site-template.your-subdomain.workers.dev",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    // 同一オリジンであれば security.checkOrigin はパスする。
    // 認証 Cookie を渡していないため後続の Action 内で 4xx になる可能性はあるが、
    // CSRF の 403 で「拒否される側」になっていないことだけを assert する。
    expect(response.status).not.toBe(403);
  });
});
