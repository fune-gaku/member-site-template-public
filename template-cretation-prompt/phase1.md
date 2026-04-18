# Phase 1: 会員サイト本体実装プロンプト

## 🎯 このプロンプトの目的

Phase 0（`npm create astro@latest` + `astro add cloudflare/vue/tailwind` + Supabase パッケージ追加）が
**完了済みの Astro プロジェクト** に対して、Supabase 連携・認証・RLS・会員ページの本体機能を実装する。

---

## 📋 前提条件（Phase 0 で完了済みのはず）

- Astro 6.x + `@astrojs/cloudflare` v13 + `@astrojs/vue` + `@tailwindcss/vite` がインストール済み
- `@supabase/supabase-js` + `@supabase/ssr` がインストール済み
- `astro.config.mjs` に `output: 'server'`、`adapter: cloudflare()`、`integrations: [vue()]`、
  `vite.plugins: [tailwindcss()]` が設定済み
- `wrangler.jsonc`、`public/favicon.svg`、`src/styles/global.css` が存在
- Node.js 22.12.0 以上

**上記が未完了の場合はこのプロンプトを実行せず、Phase 0 手順書に戻ること。**

---

## スタック前提（変更しないこと）

- Astro 6.x（`output: 'server'` SSR モード）
- `@astrojs/cloudflare` v13（Cloudflare Workers アダプタ）
- `@astrojs/vue`（Vue Islands パターン）
- `@supabase/supabase-js` v2
- `@supabase/ssr`（公式 SSR ヘルパー。旧 `auth-helpers-*` は絶対に使わない）
- Tailwind CSS 4.x（`@tailwindcss/vite` プラグイン。`@astrojs/tailwind` は使わない）

---

## 指示の解釈ルール

1. **既存ファイルは保持を原則とする**
   - `astro.config.mjs`、`tsconfig.json`、`wrangler.jsonc`、`package.json`、`src/styles/global.css`、
     `.gitignore` は `astro add` 等で既に正しく設定されている。
   - **既存ファイルには必要箇所のみ追記・修正**し、`astro add` が生成した内容は壊さない。
   - もし既存ファイルの内容と本プロンプト内の例示が異なる場合は、
     **`astro add` が生成した内容を優先**し、必要な追加設定のみマージする。

2. **新規ファイルは本プロンプトの指示通りに作成する**

3. **TypeScript strict モードで型安全に実装する**
   - 使用するすべての型・関数・定数は、ファイルの先頭で明示的にインポート
   - 型のインポート漏れ（例: `EmailOtpType`, `User`）は許容しない

4. **省略なし・TODO なしの完全な実装で出力**
   - プロジェクトコンテキスト（`.claude/CLAUDE.md` 等）のタグライン、命名規則、
     デザイン方針があればそれに従う

---

## ① 環境変数アクセスの公式推奨方針（最重要）

Astro + Cloudflare Workers では、**変数の用途ごとに取得方法を使い分ける**のが公式推奨。

### 3種類の変数と取得方法

| 用途 | 変数名 | 取得方法 | 設定場所 |
|---|---|---|---|
| ブラウザ＋サーバー両方で使う公開値 | `PUBLIC_SUPABASE_URL` | `import.meta.env.PUBLIC_SUPABASE_URL` | ビルド時（`.env` or Workers Builds 変数） |
| ブラウザ＋サーバー両方で使う公開値 | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ビルド時（`.env` or Workers Builds 変数） |
| サーバーのみで使う秘密値 | `SUPABASE_SERVICE_ROLE_KEY` | `import { env } from 'cloudflare:workers'` → `env.SUPABASE_SERVICE_ROLE_KEY` | ランタイム（`wrangler secret` or `.dev.vars`） |

### Astro 6 で削除された API（絶対に使わない）

- ❌ `Astro.locals.runtime.env` → 削除済み。代わりに `import { env } from 'cloudflare:workers'`
- ❌ `Astro.locals.runtime.cf` → `Astro.request.cf` に変更
- ❌ `Astro.locals.runtime.ctx` → `Astro.locals.cfContext` に変更
- ❌ `Astro.locals.runtime.caches` → グローバルの `caches` に変更

---

## ② 既存ファイルへの追記・修正

### A. `tsconfig.json` の `include` に追記

既存の `include` 配列に `"worker-configuration.d.ts"` を追加する。
既存が以下のような形なら:

```json
"include": [".astro/types.d.ts", "**/*"]
```

これを以下に変更:

```json
"include": [".astro/types.d.ts", "worker-configuration.d.ts", "**/*"]
```

他のキーは変更しない。

### B. `wrangler.jsonc` に `compatibility_flags` と `observability` を追記

`astro add cloudflare` が生成した `wrangler.jsonc` の `compatibility_flags` に
`"global_fetch_strictly_public"` を追加（`"nodejs_compat"` は既にあるはず）、
`observability` がなければ追加する。最終的に以下のような形にする:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "funegaku-members",
  "main": "dist/_worker.js/index.js",
  "compatibility_date": "2026-04-17",
  "compatibility_flags": [
    "nodejs_compat",
    "global_fetch_strictly_public"
  ],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist"
  },
  "observability": {
    "enabled": true
  }
}
```

**注意**:
- `name` が違う場合は既存のものを維持する
- `compatibility_date` は既存値を維持（新規なら今日の日付）
- `vars` セクションは**追加しない**（`PUBLIC_*` は Workers Builds の Build variables で管理、
  秘密値は `wrangler secret` で管理する方針のため）

### C. `src/styles/global.css` に `@theme` ブロックを追記

既存の `@import "tailwindcss";` の下に以下を追記:

```css
@theme {
  --font-sans: "DM Sans", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --color-brand-50: #f0f7ff;
  --color-brand-100: #e0effe;
  --color-brand-500: #0c8ee8;
  --color-brand-600: #006fc6;
  --color-brand-700: #0058a1;
}
```

### D. `package.json` の `scripts` に追記

既存の `scripts` に以下を追加（既にあるキーは上書きしない）:

```json
{
  "preview": "astro build && wrangler dev",
  "deploy": "astro build && wrangler deploy",
  "cf-typegen": "wrangler types"
}
```

また `engines` フィールドがなければ追加:

```json
{
  "engines": {
    "node": ">=22.12.0"
  }
}
```

### E. `.gitignore` に追記

既存の `.gitignore` の末尾に以下を追加（既にあるものは重複させない）:

```
.dev.vars
.env.production
worker-configuration.d.ts
```

### F. `astro.config.mjs` に `imageService: "compile"` を追記

`adapter: cloudflare()` を `adapter: cloudflare({ imageService: "compile" })` に変更する。
その他のオプションは変更しない。

---

## ③ 新規作成するファイル

### 1. `.nvmrc`

```
22.12.0
```

### 2. `.env.example`

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

### 3. `.dev.vars.example`

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-for-local-dev
```

### 4. `src/env.d.ts`

```typescript
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
```

### 5. `src/middleware.ts`

**重要**: 全ページで `getUser()` を呼び出すことで、期限切れトークンの
**サイレントリフレッシュ**が発動し、`createServerClient` 内部の `setAll`
コールバック経由で新しい認証 Cookie が `context.cookies.set()` されます。
Astro の `context.cookies.set()` は自動的にレスポンスの `Set-Cookie` ヘッダーに
反映されるため、手動でレスポンスを加工する必要はありません。

```typescript
import { defineMiddleware } from "astro:middleware";
import { createClient } from "./lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  // 全ページで Supabase クライアントを生成し getUser() を呼ぶ。
  // これにより期限切れトークンのサイレントリフレッシュが走り、
  // createServerClient 内の setAll 経由で新しい Cookie が
  // context.cookies.set() される（Astro が自動で response に反映）。
  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;

  // /member 配下は認証必須。未認証なら /auth/signin にリダイレクト。
  if (context.url.pathname.startsWith("/member") && !user) {
    return context.redirect(
      `/auth/signin?next=${encodeURIComponent(context.url.pathname)}`,
    );
  }

  return next();
});
```

**やってはいけないこと**: `next()` の返り値 `Response` を受け取って Cookie を
手動でコピーする処理は**不要**かつ**誤り**。Astro のランタイムが
`context.cookies.set()` の内容を自動的にレスポンスヘッダーへ書き出す。
手動コピーすると二重書き込みや型エラーの原因になる。

### 6. `src/lib/supabase.ts`（サーバー用）

```typescript
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

export function createClient({
  request,
  cookies,
}: {
  request: Request;
  cookies: AstroCookies;
}) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
            ({ name, value }) => ({
              name,
              value: value ?? "",
            }),
          );
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookies.set(name, value, options),
          );
        },
      },
    },
  );
}
```

### 7. `src/lib/supabase-browser.ts`（ブラウザ用）

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  return createBrowserClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
```

### 8. `src/lib/supabase-admin.ts`（admin 専用・サーバーのみ）

service_role キーは `cloudflare:workers` の `env` から取得。
**モジュールスコープで初期化しない**（Supabase 公式がリクエスト間のセッション漏洩防止のため明示的に禁止）。
ファクトリ関数として毎リクエスト新規生成する。

**重要**: `env.SUPABASE_SERVICE_ROLE_KEY` は `worker-configuration.d.ts` で
型が付くが、実行時に値が存在する保証はない（Cloudflare ダッシュボードでの
Secret 登録忘れ、`.dev.vars` の記述漏れ等で `undefined` になりうる）。
**早期フェイル**のため明示的なガードを入れること。これにより、
本番で分かりにくい 401/fetch failed 系のエラーではなく、
原因が明確なエラーで即座に失敗する。

```typescript
import { createClient } from "@supabase/supabase-js";
import { env } from "cloudflare:workers";

export function createAdminClient() {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "For production, run `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` " +
        "or set it in Cloudflare dashboard > Workers > Settings > Variables and Secrets. " +
        "For local dev, add it to .dev.vars.",
    );
  }

  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
```

**注**: ガード後は TypeScript が `serviceRoleKey` を `string` として型推論するため、
`as string` キャストは不要。

### 9. `src/actions/index.ts`

Zod は必ず `astro/zod` からインポート（`zod` ではない）。

```typescript
import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { createClient } from "../lib/supabase";
import { createAdminClient } from "../lib/supabase-admin";

export const server = {
  auth: {
    signUp: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: `${context.url.origin}/auth/callback`,
          },
        });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),

    signIn: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string(),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (error) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),

    signOut: defineAction({
      handler: async (_, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        await supabase.auth.signOut();
        return { success: true };
      },
    }),

    resetPassword: defineAction({
      accept: "form",
      input: z.object({ email: z.string().email() }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo: `${context.url.origin}/auth/callback?type=recovery`,
          },
        );
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),
  },

  storage: {
    uploadAvatar: defineAction({
      accept: "form",
      input: z.object({
        file: z.instanceof(File),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });

        const filePath = `${user.id}/${Date.now()}_${input.file.name}`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(filePath, input.file, { upsert: true });

        if (error) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
        return { path: filePath };
      },
    }),

    getSignedUrl: defineAction({
      input: z.object({ path: z.string() }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(input.path, 3600);
        if (error) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        return { url: data.signedUrl };
      },
    }),
  },

  admin: {
    createUser: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string().min(6),
        displayName: z.string().optional(),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const {
          data: { user: caller },
        } = await supabase.auth.getUser();
        if (!caller) throw new ActionError({ code: "UNAUTHORIZED" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", caller.id)
          .single();
        if (profile?.role !== "admin") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Admin only",
          });
        }

        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { display_name: input.displayName ?? "" },
        });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { userId: data.user.id };
      },
    }),

    inviteUser: defineAction({
      accept: "form",
      input: z.object({ email: z.string().email() }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const {
          data: { user: caller },
        } = await supabase.auth.getUser();
        if (!caller) throw new ActionError({ code: "UNAUTHORIZED" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", caller.id)
          .single();
        if (profile?.role !== "admin") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Admin only",
          });
        }

        const supabaseAdmin = createAdminClient();
        const { data, error } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
            redirectTo: `${context.url.origin}/auth/callback`,
          });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { userId: data.user.id };
      },
    }),
  },
};
```

### 10. Layout ファイル（3つ）

#### `src/layouts/Base.astro`

```astro
---
import "../styles/global.css";

interface Props {
  title: string;
  description?: string;
}

const { title, description = "" } = Astro.props;
---

<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title}</title>
  </head>
  <body class="min-h-screen bg-white text-gray-900 font-sans antialiased">
    <slot />
  </body>
</html>
```

#### `src/layouts/Auth.astro`

未ログインユーザー向け（サインイン/サインアップ/パスワードリセット）のレイアウト。
Baseをラップし、中央寄せのカード UI を提供する。Tailwind 4 の `@theme` で定義した
`brand` カラーと `font-sans` を活用したモダンで落ち着いたデザイン。

#### `src/layouts/Member.astro`

ログイン済みユーザー向けのダッシュボードレイアウト。
ヘッダーに navigation（Dashboard / Profile / Data）とサインアウトボタン、
サイドバー or トップナビで構成。`Astro.locals.user` を使ってユーザー名を表示する。

### 11. Vue コンポーネント（4つ）

以下を実装。Tailwind 4 の `@theme` 変数をフル活用し、`ActionError` のエラー表示、
ローディング状態を含む実用的な UI にすること。

- **`src/components/SignupForm.vue`**: メール・パスワード入力、`actions.auth.signUp` を呼び出し、
  成功時は確認メール送信のメッセージを表示
- **`src/components/LoginForm.vue`**: メール・パスワード入力、`actions.auth.signIn` を呼び出し、
  成功時はダッシュボードへリダイレクト
- **`src/components/ProfileForm.vue`**: アバターアップロード機能付き。
  `actions.storage.uploadAvatar` でアップロード、`supabase-browser` から `createSignedUrl` で
  表示 URL を取得するか、`actions.storage.getSignedUrl` を使う
- **`src/components/SampleDataTable.vue`**: `member_posts` テーブルからデータを取得して表示する
  サンプル。`createBrowserSupabase()` を使ってクライアント側で SELECT する

Vue コンポーネント内から `actions` を使う場合は `import { actions } from "astro:actions"` でインポート。

### 12. Pages（10個）

#### `src/pages/index.astro`

既存のテンプレートを会員サイトのランディングページに置き換える。
プロジェクトコンテキストにタグライン（例: 「船の現場を、整える。」）があれば採用する。
サインアップ・サインインへの導線を含む。

#### `src/pages/auth/signup.astro`

`Auth.astro` レイアウトを使い、`SignupForm.vue` を `client:load` でマウント。

#### `src/pages/auth/signin.astro`

`Auth.astro` レイアウトを使い、`LoginForm.vue` を `client:load` でマウント。

#### `src/pages/auth/reset-password.astro`

`Auth.astro` レイアウトを使い、パスワードリセット用のフォーム（メールアドレス入力）を表示。
`actions.auth.resetPassword` を呼び出す。

#### `src/pages/auth/callback.astro`

```astro
---
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase";

const supabase = createClient({
  request: Astro.request,
  cookies: Astro.cookies,
});

const url = new URL(Astro.request.url);
const token_hash = url.searchParams.get("token_hash");
const type = url.searchParams.get("type") as EmailOtpType | null;
const code = url.searchParams.get("code");

if (token_hash && type) {
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (!error) return Astro.redirect("/member/dashboard");
}
if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return Astro.redirect("/member/dashboard");
}
return Astro.redirect("/auth/signin?error=auth_failed");
---
```

#### `src/pages/auth/signout.astro`

`actions.auth.signOut` を呼び出してトップページにリダイレクトするページ。
`method="POST"` の form で Astro Actions を使う（zero-JS フォールバック）。

#### `src/pages/member/dashboard.astro`

`Member.astro` レイアウトを使用。ウェルカムメッセージ、最近のアクティビティ、
重要な統計情報などのダッシュボード UI を表示する。`Astro.locals.user` を使用。

#### `src/pages/member/profile.astro`

`Member.astro` レイアウトを使用。`ProfileForm.vue` を `client:load` でマウント。

#### `src/pages/member/data.astro`

`Member.astro` レイアウトを使用。`SampleDataTable.vue` を `client:load` でマウント。

### 13. `supabase/migrations/001_init.sql`

以下のすべてを含む初期マイグレーション:

#### profiles テーブル

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id);

-- 権限昇格攻撃（Privilege Escalation）防止:
-- 一般ユーザー（authenticated ロール）からは role 列の UPDATE 権限を剥奪する。
-- これにより、ユーザーが自分の profile 行を更新する際、role 列だけは変更できなくなる。
-- カラムレベル権限は RLS より先に評価されるため、RLS の with check で
-- サブクエリを書くよりシンプルで堅牢。
-- role の変更は管理者が service_role 経由（createAdminClient）で行う前提。
revoke update (role) on public.profiles from authenticated;

-- 新規ユーザー作成時に profiles を自動作成するトリガー
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

#### member_posts テーブル（サンプル用）

```sql
create table public.member_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

alter table public.member_posts enable row level security;

create policy "Users can view own posts"
on public.member_posts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own posts"
on public.member_posts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own posts"
on public.member_posts for update
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete own posts"
on public.member_posts for delete
to authenticated
using ((select auth.uid()) = user_id);
```

#### avatars バケット + RLS

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false);

create policy "Users can view own avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "Users can upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "Users can update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "Users can delete own avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
```

---

## ④ 出力ステップ

ファイルが多いので、3ステップに分けて出力すること。
各ステップの末尾に **「次のステップに進む準備ができました」** と明示し、
ユーザーの合図を待ってから次のステップに進む。

### Step 1: 設定ファイル・ライブラリ・Actions

- 既存ファイルの追記・修正（`tsconfig.json`、`wrangler.jsonc`、`global.css`、
  `package.json`、`.gitignore`、`astro.config.mjs`）
- 新規作成: `.nvmrc`、`.env.example`、`.dev.vars.example`、`src/env.d.ts`、
  `src/middleware.ts`、`src/lib/supabase.ts`、`src/lib/supabase-browser.ts`、
  `src/lib/supabase-admin.ts`、`src/actions/index.ts`

### Step 2: Layouts と Vue コンポーネント

- `src/layouts/Base.astro`、`Auth.astro`、`Member.astro`
- `src/components/SignupForm.vue`、`LoginForm.vue`、`ProfileForm.vue`、`SampleDataTable.vue`

### Step 3: Pages と SQL マイグレーション

- `src/pages/index.astro` と auth/* 、member/* の全ページ
- `supabase/migrations/001_init.sql`

---

## ⑤ 完了後の動作確認手順（最後に表示する）

Step 3 の出力後、以下のセクションを Claude Code が表示すること:

```markdown
## ✅ 実装完了。次の手順で動作確認を

1. `.env` と `.dev.vars` をローカルに用意:
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   # それぞれ実値を記入

2. Supabase でマイグレーションを適用:
   Supabase ダッシュボードの SQL Editor で
   supabase/migrations/001_init.sql を実行

3. Cloudflare Worker の型を再生成:
   npm run cf-typegen

4. 開発サーバを起動:
   npm run dev

5. http://localhost:4321 にアクセスして動作確認
   - サインアップ → 確認メール受信 → リンククリック
   - ログイン → /member/dashboard にリダイレクトされること

Phase 2（ESLint + Prettier + Vitest セットアップ）に進む準備ができたら、
phase2-quality-assurance.md プロンプトを実行してください。
```

---

## 引き継ぎメモ（絶対に守ってほしい）

| 項目 | 誤り（書いてはいけない） | 正しい実装 |
|---|---|---|
| 環境変数（Astro 6） | `Astro.locals.runtime.env`（削除済み） | `import { env } from 'cloudflare:workers'` |
| `cf` オブジェクト | `Astro.locals.runtime.cf` | `Astro.request.cf` |
| ExecutionContext | `Astro.locals.runtime.ctx` | `Astro.locals.cfContext` |
| caches API | `Astro.locals.runtime.caches` | グローバルの `caches` |
| Tailwind | `@astrojs/tailwind` + `tailwind.config.mjs` | `@tailwindcss/vite`（既に設定済み）+ `@theme` |
| SSR クライアント | 手動 `cookies.set('sb-access-token', ...)` | `@supabase/ssr` の `createServerClient` |
| admin クライアント | モジュールスコープで初期化 | ファクトリ関数で毎リクエスト生成 |
| admin クライアント | `env.SUPABASE_SERVICE_ROLE_KEY as string` | undefined ガード → 型推論で自動 `string` |
| Zod インポート | `from 'zod'` | `from 'astro/zod'` |
| 認可チェック | `supabase.auth.getSession()` | `supabase.auth.getUser()` |
| 認可チェック（位置） | `/member` 配下だけで `getUser()` | **全ページで `getUser()`**（トークン自動リフレッシュ） |
| middleware の Cookie | `next()` の Response を手動で加工 | `context.cookies.set()` が自動反映。加工不要 |
| 認証コールバック | `exchangeCodeForSession` のみ | `verifyOtp` + `exchangeCodeForSession` の両対応 |
| `parseCookieHeader` の戻り値 | そのまま渡す | `.map(({ name, value }) => ({ name, value: value ?? "" }))` |
| ブラウザクライアント | `createClient`（`@supabase/supabase-js`） | `createBrowserClient`（`@supabase/ssr`） |
| role 列の防御 | RLS の `with check` でサブクエリ | `revoke update (role) on public.profiles from authenticated`（カラムレベル権限） |