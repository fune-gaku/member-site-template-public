# Issue #004: 必須セキュリティヘッダ（CSP / HSTS / X-Frame-Options 等）の欠落

**作成日**: 2026-04-19
**優先度**: Medium
**ステータス**: Open
**カテゴリ**: Security (Hardening)

---

## 問題の概要

本番デプロイ (`https://member-site-template.fune-gaku.workers.dev`) のレスポンスヘッダに、現代の Web アプリに必須のセキュリティヘッダが **ひとつも設定されていない**。

### `curl -I` 実測（抜粋）

```
HTTP/2 200
date: Sun, 19 Apr 2026 07:40:44 GMT
content-type: text/html
report-to: {...}
nel: {...}
server: cloudflare
cf-ray: ...
alt-svc: h3=":443"; ma=86400
```

Cloudflare 由来の `report-to` / `nel` / `alt-svc` 以外、**アプリケーション側で付与しているセキュリティヘッダは皆無**。

### 欠落しているヘッダ

| ヘッダ                        | 欠落の影響                                                              |
| ----------------------------- | ----------------------------------------------------------------------- |
| `Content-Security-Policy`     | 将来 XSS が混入した際の緩和がゼロ。`v-html` 追加等で即座に露呈          |
| `Strict-Transport-Security`   | 初回アクセスの HTTPS ダウングレード / SSL Stripping を防げない          |
| `X-Frame-Options` / `frame-ancestors` | クリックジャッキング（管理画面のロール変更ボタンを透明 iframe で被せ誘導） |
| `X-Content-Type-Options`      | MIME sniffing によるタイプ混同攻撃                                      |
| `Referrer-Policy`             | 画面遷移時に完全 URL（クエリ含む）が外部へ送信される                    |
| `Permissions-Policy`          | 不要なブラウザ機能（カメラ・マイク・位置情報 等）を無効化できない      |

---

## 影響

- テンプレートを利用する開発者がそのまま本番投入すると、上記すべての脆弱性クラスを抱える
- Mozilla Observatory / securityheaders.com では **F / D 評価** になり、セキュリティ監査で必ず指摘される
- 特に会員制サイトは管理画面を持つため **クリックジャッキングによる権限昇格 / 登録情報改ざん** のリスクが高い

---

## 解決策

### 方針

Astro の middleware 層で `next()` から返ってきた `Response` の headers を書き換える。Astro 6 公式ドキュメントの middleware パターン（`defineMiddleware` → `const response = await next(); response.headers.set(...)`）に沿う。

Astro 6 には `experimental.csp` による CSP 自動ハッシュ生成機能もあるが、Vue アイランドのハイドレーション用インラインスクリプトとの組み合わせで制約（Shiki 不可など）があるため、**まず middleware で静的ポリシーを配るアプローチを採用**し、段階的にハッシュ化に移行する。

### 実装タスク

#### 1. 共通ユーティリティ: `src/lib/security-headers.ts`（新規）

```ts
/**
 * 全ページに適用するセキュリティヘッダ。
 *
 * 設計方針:
 * - Astro + Vue のハイドレーション用インラインスクリプト / スタイルが存在するため
 *   CSP は 'unsafe-inline' を許容する（次フェーズで Astro experimental.csp による
 *   ハッシュ化に移行する前提）
 * - Supabase Storage (*.supabase.co) からの署名付き URL 画像を許可
 * - Supabase Auth / DB API への接続を許可
 */
export const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング対策（CSP frame-ancestors と二重化）
  "X-Frame-Options": "DENY",

  // MIME sniffing 対策
  "X-Content-Type-Options": "nosniff",

  // リファラ情報の最小化
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // HTTPS 強制（2 年 + サブドメイン + preload-ready）
  "Strict-Transport-Security":
    "max-age=63072000; includeSubDomains; preload",

  // 不要なブラウザ機能を全て拒否（必要に応じて個別に許可へ）
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), " +
    "magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",

  // Cross-Origin-Opener-Policy: ポップアップと元窓の分離
  "Cross-Origin-Opener-Policy": "same-origin",

  // CSP 本体
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    // Astro/Vue のハイドレーションがインライン script/style を出力するため暫定 unsafe-inline
    // TODO: Astro experimental.csp によるハッシュ化へ移行したら 'unsafe-inline' を削除
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Supabase Auth / REST / Realtime への接続を許可
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "upgrade-insecure-requests",
  ].join("; "),
};

export function applySecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // 他の middleware / Cloudflare が既に値を入れていたら尊重
    if (!response.headers.has(name)) {
      response.headers.set(name, value);
    }
  }
}
```

#### 2. middleware に組み込み: `src/middleware.ts`

```ts
import { defineMiddleware } from "astro:middleware";

import { createClient } from "./lib/supabase";
import { applySecurityHeaders } from "./lib/security-headers";

export const onRequest = defineMiddleware(async (context, next) => {
  // ...既存の認証・role ロジックはそのまま...

  const response = await next();

  // 既存: /member /admin は private, no-store
  if (isMemberArea || isAdminArea) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  // 追加: 全レスポンスに共通のセキュリティヘッダを付与
  applySecurityHeaders(response);

  return response;
});
```

#### 3. 動作確認コマンド

```bash
# ローカル
npm run dev
curl -sI http://localhost:4321/ | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'

# 本番（デプロイ後）
curl -sI https://member-site-template.fune-gaku.workers.dev/ | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'
```

#### 4. （段階的移行）Astro `experimental.csp` でインラインをハッシュ化

`astro.config.mjs`:

```js
export default defineConfig({
  experimental: {
    csp: {
      algorithm: "SHA-256",
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob: https://*.supabase.co",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      ],
      // Astro がビルド時にインライン script/style のハッシュを自動挿入
    },
  },
});
```

移行時は `'unsafe-inline'` を CSP から削除する。テンプレートとしては **Phase 2 品質保証フェーズで移行** するのが妥当。

#### 5. テスト: `tests/security-headers.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../src/lib/security-headers";

describe("SECURITY_HEADERS", () => {
  it("contains all required directives", () => {
    expect(SECURITY_HEADERS).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": expect.stringContaining("strict-origin"),
      "Strict-Transport-Security": expect.stringContaining("max-age"),
      "Content-Security-Policy": expect.stringContaining("frame-ancestors 'none'"),
    });
  });

  it("CSP allows Supabase endpoints", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
  });

  it("HSTS has production-grade max-age", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
    expect(hsts).toMatch(/max-age=(\d+)/);
    const maxAge = parseInt(hsts.match(/max-age=(\d+)/)![1], 10);
    expect(maxAge).toBeGreaterThanOrEqual(31536000); // 1 年以上
  });
});
```

---

## 受け入れ基準

- [ ] 本番 (`.workers.dev`) / ローカル双方で `curl -sI /` が CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy を返す
- [ ] Supabase Auth （サインイン・サインアウト・プロフィール取得）が CSP 違反なく動作する（ブラウザ DevTools Console に CSP error が出ない）
- [ ] Avatar 画像表示（`https://<ref>.supabase.co/...` への画像 GET）が `img-src` で許可される
- [ ] [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com) スキャンで **A 以上**
- [ ] `/member` `/admin` 配下の `Cache-Control: private, no-store` は既存挙動のまま
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Astro: Middleware](https://docs.astro.build/en/guides/middleware/)
- [Astro: Configuration Reference - security](https://docs.astro.build/en/reference/configuration-reference/#security)
- [Astro: Experimental CSP flag](https://docs.astro.build/en/reference/experimental-flags/csp/)
- [Cloudflare Workers: Setting security headers](https://developers.cloudflare.com/workers/examples/security-headers/)
- [MDN: Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy)
- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)

---

## ラベル

`security`, `hardening`, `csp`, `hsts`, `medium-priority`
