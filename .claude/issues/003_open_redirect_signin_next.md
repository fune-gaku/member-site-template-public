# Issue #003: `/auth/signin?next=...` の Open Redirect 脆弱性

**作成日**: 2026-04-19
**優先度**: High
**ステータス**: Open
**カテゴリ**: Security (Vulnerability)

---

## 問題の概要

サインインフォームがクエリパラメータ `next` を検証せずそのまま `window.location.href` に代入しているため、**ログイン成功直後に任意の外部ドメインへ遷移させられる**（Open Redirect / CWE-601）。

### 該当箇所

**[src/components/LoginForm.vue:27-29](../../src/components/LoginForm.vue#L27-L29)**

```ts
const urlParams = new URLSearchParams(window.location.search);
const next = urlParams.get("next") || "/member/dashboard";
window.location.href = next;
```

### 確認済みの攻撃ペイロード

以下の URL はいずれも `curl -I` で `200 OK` を返し、認証成功後にブラウザが指定先へ遷移することをビルド済み [LoginForm.BqP_UfAj.js](../../dist/client/_astro/LoginForm.BqP_UfAj.js) でも確認済み。

| ペイロード                                                                 | 挙動                                   |
| -------------------------------------------------------------------------- | -------------------------------------- |
| `https://member-site-template.fune-gaku.workers.dev/auth/signin?next=//evil.example.com`    | プロトコル相対 URL → `evil.example.com` |
| `https://.../auth/signin?next=https://evil.example.com`                    | 絶対 URL → 外部サイトへ遷移            |
| `https://.../auth/signin?next=javascript:alert(1)`                         | `location.href` 経由の JavaScript 実行 |

---

## 影響

- **フィッシング攻撃の成功率が大幅に上昇**する：正規ドメインで認証後、攻撃者サイトへ自動遷移するため被害者は違和感なく偽ログインフォームにパスワードを再入力してしまう
- `javascript:` スキームが通る場合は **DOM-based XSS** に発展（ブラウザ実装次第だが、`location.href = "javascript:..."` は多くのブラウザで実行される）
- middleware 側 [src/middleware.ts:28](../../src/middleware.ts#L28) の `context.redirect(\`/auth/signin?next=${encodeURIComponent(pathname)}\`)` は内部 pathname のみを載せるため server 側は安全だが、**攻撃者はリンクを直接作って配布できる**のでサーバ側の安全性だけでは不十分

---

## 解決策

### 方針

`next` を **同一オリジン内のパスのみ許可する** ホワイトリスト検証に変更する。検証はサーバ側（信頼できる）で行い、フロントエンド側は検証済みの値のみ使う。

### 実装タスク

#### 1. 共通ユーティリティ: `src/lib/safe-redirect.ts`（新規）

```ts
/**
 * Open Redirect 対策: `next` クエリパラメータをサニタイズする。
 *
 * 許可するのは「/ で始まり、// では始まらない、スキームを含まないパス」のみ。
 * - "/member/dashboard" → そのまま返す
 * - "//evil.example.com" → fallback を返す（protocol-relative URL 攻撃の防止）
 * - "https://evil" → fallback（絶対 URL の防止）
 * - "javascript:alert(1)" → fallback（JS スキーム実行の防止）
 * - "\\evil" → fallback（バックスラッシュを / に解釈するブラウザ対策）
 *
 * CWE-601 / OWASP "Unvalidated Redirects and Forwards" 準拠。
 */
export function safeNextPath(
  rawNext: string | null | undefined,
  fallback = "/member/dashboard",
): string {
  if (!rawNext) return fallback;

  // 制御文字・前後空白を除去
  const trimmed = rawNext.trim();
  if (!trimmed) return fallback;

  // "/" で始まり、かつ "//" と "/\" では始まらないこと
  if (!/^\/[^/\\]/.test(trimmed)) return fallback;

  // 念のためスキーム混入を弾く（"/foo?x=https:..." 自体は OK なので完全 URL パースはしない）
  if (/^\s*[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;

  return trimmed;
}
```

#### 2. サインインページで SSR 時に検証して渡す: `src/pages/auth/signin.astro`

```astro
---
import LoginForm from "../../components/LoginForm.vue";
import Auth from "../../layouts/Auth.astro";
import { safeNextPath } from "../../lib/safe-redirect";

const nextPath = safeNextPath(Astro.url.searchParams.get("next"));
---

<Auth title="サインイン" description="アカウントにログインしてください">
  <LoginForm client:load next={nextPath} />
</Auth>
```

#### 3. `LoginForm.vue` を props ベースに変更

```vue
<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

const props = withDefaults(
  defineProps<{ next?: string }>(),
  { next: "/member/dashboard" },
);

// ...中略...

async function handleSubmit() {
  // 成功時:
  window.location.href = props.next; // 既にサーバで検証済み
}
</script>
```

- `window.location.search` から直接読まないため、**XSS によるクエリ改ざんでもリダイレクト先はサーバが許可したパスに限定される**

#### 4. 同様に middleware → signin リダイレクトも検証（多層防御）

[src/middleware.ts:27-29](../../src/middleware.ts#L27-L29) は現状 `pathname` のみ載せているので安全だが、将来的に変更されても壊れないよう safeNextPath を使う。

```ts
import { safeNextPath } from "./lib/safe-redirect";
// ...
const nextParam = safeNextPath(pathname);
return context.redirect(`/auth/signin?next=${encodeURIComponent(nextParam)}`);
```

#### 5. テスト（`tests/safe-redirect.test.ts` 新規）

```ts
import { describe, expect, it } from "vitest";
import { safeNextPath } from "../src/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/member/dashboard", "/member/dashboard"],
    ["/member/profile?x=1", "/member/profile?x=1"],
  ])("allows relative paths: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "//evil.example.com",
    "///evil.example.com",
    "/\\evil.example.com",
    "https://evil.example.com",
    "http://evil.example.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "",
    "   ",
    null,
    undefined,
  ])("rejects dangerous input: %s", (input) => {
    expect(safeNextPath(input as string | null)).toBe("/member/dashboard");
  });
});
```

---

## 受け入れ基準

- [ ] `curl -sL '.../auth/signin?next=//evil.example.com'` でログインしても `//evil.example.com` へ遷移しない（フォールバックの `/member/dashboard` へ行く）
- [ ] 正規の `/auth/signin?next=/member/profile` は従来どおり動作する
- [ ] `safe-redirect.test.ts` が全ケース green
- [ ] middleware から押し返された場合の `next` 往復も機能する
- [ ] typecheck / lint / test pass

---

## 参考資料

- [OWASP: Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)
- [CWE-601: URL Redirection to Untrusted Site](https://cwe.mitre.org/data/definitions/601.html)
- [Astro: Passing server values to client components](https://docs.astro.build/en/guides/framework-components/#passing-children-to-framework-components)
- [Supabase Auth: 認証後の遷移（redirectTo は Supabase Dashboard の Redirect URL allowlist と別管理）](https://supabase.com/docs/guides/auth/redirect-urls)

---

## ラベル

`security`, `vulnerability`, `open-redirect`, `high-priority`
