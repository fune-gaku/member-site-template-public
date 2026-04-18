# Phase 2: 品質保証（ESLint + Prettier + Vitest）プロンプト

## 🎯 このプロンプトの目的

Phase 1 で実装した会員サイトに対して、以下の品質保証ツールを導入する:

- **ESLint**（Astro + TypeScript + Vue 対応・スタンダード構成）
- **Prettier**（Astro + Tailwind 対応）
- **Vitest + Container API**（ユニット・統合テスト）
- **`@cloudflare/vitest-pool-workers`**（実 workerd ランタイムでの統合テスト）

---

## 📋 前提条件（Phase 1 完了済みであること）

- Astro 6.x + Cloudflare Workers + Supabase の会員サイト実装が完了している
- `npm run dev` で開発サーバが起動し、サインアップ〜ログインが動作している
- `src/actions/index.ts`、`src/lib/supabase.ts`、`src/middleware.ts` 等が存在する

---

## 指示の解釈ルール

1. **Phase 1 で作成した既存ファイルは変更しない**（テストやlint設定の追加のみ）
2. **TypeScript strict モードを維持する**
3. **省略なし・TODO なしで出力する**
4. **ESLint は Flat Config（`eslint.config.js`）で構成する**（旧 `.eslintrc` 形式は使わない）
5. **Vitest は公式ヘルパー `getViteConfig()` を使用する**（Astro 設定を継承）
6. **Astro 6 では Astro コンポーネントのテストは `environment: 'node'` が必須**

---

## ① インストールするパッケージ

### ESLint 関連

```bash
npm install -D \
  eslint \
  eslint-plugin-astro \
  eslint-plugin-vue \
  @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin \
  eslint-plugin-import \
  eslint-config-prettier \
  globals \
  typescript-eslint
```

### Prettier 関連

```bash
npm install -D \
  prettier \
  prettier-plugin-astro \
  prettier-plugin-tailwindcss
```

### Vitest 関連

```bash
npm install -D \
  vitest \
  @vitest/ui \
  @cloudflare/vitest-pool-workers \
  happy-dom
```

これらのインストールを、Claude Code は以下のいずれかで実行:

- 上記コマンドをそのまま提案してユーザーに実行してもらう
- `package.json` の `devDependencies` に追加する指示を出す

---

## ② 既存ファイルへの追記

### A. `package.json` の `scripts` に追記

既存の `scripts` に以下を追加:

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write \"**/*.{astro,ts,tsx,js,jsx,vue,md,json}\" --ignore-path .gitignore",
  "format:check": "prettier --check \"**/*.{astro,ts,tsx,js,jsx,vue,md,json}\" --ignore-path .gitignore",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "typecheck": "astro check"
}
```

### B. `.gitignore` に追記

既存の `.gitignore` 末尾に追加:

```
coverage
.vitest-cache
```

---

## ③ 新規作成するファイル

### 1. `eslint.config.js`（Flat Config）

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import vue from "eslint-plugin-vue";
import importPlugin from "eslint-plugin-import";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  // グローバル無視
  {
    ignores: [
      "dist/**",
      ".astro/**",
      ".wrangler/**",
      "node_modules/**",
      "coverage/**",
      "worker-configuration.d.ts",
    ],
  },

  // 基本 JS ルール
  js.configs.recommended,

  // TypeScript strict
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Astro
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-strict"],

  // Vue
  ...vue.configs["flat/recommended"],

  // 共通ルール
  {
    files: ["**/*.{js,ts,tsx,astro,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // import 順序
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": "error",

      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
    },
  },

  // Vue ファイル用に parser を指定
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },

  // テストファイル用の緩和ルール
  {
    files: ["tests/**/*.ts", "**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Prettier と競合するルールを無効化（必ず最後に配置）
  prettierConfig,
];
```

### 2. `.prettierrc.mjs`

```javascript
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  tabWidth: 2,
  useTabs: false,
  printWidth: 80,
  endOfLine: "lf",
  plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: "*.astro",
      options: {
        parser: "astro",
      },
    },
  ],
};
```

### 3. `.prettierignore`

```
dist
.astro
.wrangler
node_modules
coverage
worker-configuration.d.ts
package-lock.json
*.md
```

### 4. `vitest.config.ts`

```typescript
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    // Astro コンポーネントのテストには node 環境が必須（Astro 6 破壊的変更）
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/workers/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,astro,vue}"],
      exclude: ["src/**/*.test.ts", "src/env.d.ts"],
    },
  },
});
```

### 5. `vitest.workers.config.ts`

Cloudflare Workers ランタイムでの統合テスト専用設定。

```typescript
/// <reference types="vitest/config" />
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["tests/workers/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./wrangler.jsonc",
        },
        miniflare: {
          compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
          compatibilityDate: "2026-04-17",
          // ローカルテスト用のダミー値
          bindings: {
            SUPABASE_SERVICE_ROLE_KEY: "dummy-service-role-key-for-testing",
          },
        },
      },
    },
  },
});
```

### 6. テストファイル

#### 6-1. `tests/unit/actions-schema.test.ts`

Astro Actions の Zod スキーマをテスト。Supabase 非依存なので高速。

```typescript
import { describe, it, expect } from "vitest";
import { z } from "astro/zod";

// src/actions/index.ts から schema だけを再定義してテスト
// （実際の actions は Astro コンテキストが必要なため）

describe("auth.signUp schema", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  it("有効な入力を受け入れる", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "securePass123",
    });
    expect(result.success).toBe(true);
  });

  it("無効なメールアドレスを拒否する", () => {
    const result = schema.safeParse({
      email: "not-an-email",
      password: "securePass123",
    });
    expect(result.success).toBe(false);
  });

  it("短すぎるパスワードを拒否する", () => {
    const result = schema.safeParse({
      email: "redacted@example.com",
      password: "abc",
    });
    expect(result.success).toBe(false);
  });
});

describe("auth.resetPassword schema", () => {
  const schema = z.object({ email: z.string().email() });

  it("有効なメールアドレスを受け入れる", () => {
    const result = schema.safeParse({ email: "redacted@example.com" });
    expect(result.success).toBe(true);
  });

  it("メールアドレス以外を拒否する", () => {
    const result = schema.safeParse({ email: "invalid" });
    expect(result.success).toBe(false);
  });
});

describe("admin.createUser schema", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().optional(),
  });

  it("displayName なしでも有効", () => {
    const result = schema.safeParse({
      email: "new@example.com",
      password: "secret123",
    });
    expect(result.success).toBe(true);
  });

  it("displayName 付きで有効", () => {
    const result = schema.safeParse({
      email: "new@example.com",
      password: "secret123",
      displayName: "藤井迪生",
    });
    expect(result.success).toBe(true);
  });
});
```

#### 6-2. `tests/unit/supabase-client.test.ts`

`createClient` ヘルパーが正しく構築できることをテスト。

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "../../src/lib/supabase";

// import.meta.env をモック
vi.stubEnv("PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

describe("createClient", () => {
  let mockCookies: {
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCookies = {
      set: vi.fn(),
      get: vi.fn(),
    };
  });

  it("request と cookies を受け取って client を返す", () => {
    const request = new Request("https://example.com", {
      headers: { Cookie: "" },
    });
    const client = createClient({
      request,
      // biome-ignore lint/suspicious/noExplicitAny: テスト用
      cookies: mockCookies as any,
    });
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
  });

  it("Cookie ヘッダーが空でもエラーにならない", () => {
    const request = new Request("https://example.com");
    expect(() =>
      createClient({
        request,
        // biome-ignore lint/suspicious/noExplicitAny: テスト用
        cookies: mockCookies as any,
      }),
    ).not.toThrow();
  });
});
```

#### 6-3. `tests/unit/middleware.test.ts`

middleware の認可ロジックをテスト。Supabase はモック化。

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase をモック
vi.mock("../../src/lib/supabase", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(),
    },
  })),
}));

import { onRequest } from "../../src/middleware";
import { createClient } from "../../src/lib/supabase";

describe("middleware: /member 配下の認可", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未認証で /member/dashboard にアクセスすると /auth/signin にリダイレクト", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null },
      redirect: vi.fn(
        (path: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: path },
          }),
      ),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signin"),
    );
    expect(context.redirect).toHaveBeenCalledWith(
      expect.stringContaining("next=%2Fmember%2Fdashboard"),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("認証済みユーザーは /member 配下にアクセスできる", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
    };

    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/member/dashboard"),
      request: new Request("https://example.com/member/dashboard"),
      cookies: {},
      locals: { user: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(context.locals.user).toEqual(mockUser);
  });

  it("/member 以外のパスでは未認証でもリダイレクトしない（ただし getUser は全ページで呼ばれる）", async () => {
    // 新しい middleware は全ページで getUser() を呼ぶ
    // （トークンの自動リフレッシュのため）
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any);

    const context = {
      url: new URL("https://example.com/auth/signin"),
      request: new Request("https://example.com/auth/signin"),
      cookies: {},
      locals: { user: null },
      redirect: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: モック簡略化のため
    } as any;
    const next = vi.fn(async () => new Response("ok"));

    await onRequest(context, next);

    // 全ページで getUser（トークンリフレッシュ）が走る
    expect(createClient).toHaveBeenCalled();
    // しかし /member 以外はリダイレクトされない
    expect(context.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
```

#### 6-4. `tests/integration/pages.test.ts`

Astro Container API でページコンポーネントをテスト。

```typescript
import { describe, it, expect } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getContainerRenderer as vueContainerRenderer } from "@astrojs/vue";
import { loadRenderers } from "astro:container";

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
```

#### 6-5. `tests/workers/env.test.ts`

実 workerd ランタイムで `cloudflare:workers` の `env` が取得できることを確認。

```typescript
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";

describe("Cloudflare Workers environment", () => {
  it("SUPABASE_SERVICE_ROLE_KEY が env に含まれる", () => {
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
    expect(typeof env.SUPABASE_SERVICE_ROLE_KEY).toBe("string");
  });

  it("テスト用のダミーキーが設定されている", () => {
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(
      "dummy-service-role-key-for-testing",
    );
  });
});
```

### 7. `tests/README.md`

テスト実行方法を簡潔に書いたドキュメント。

````markdown
# テスト構成

## テストの種類

### ユニット/統合テスト（`tests/unit/` と `tests/integration/`）

Vitest + Astro の `getViteConfig()` で実行。Node 環境。

```bash
npm run test                 # 1回実行
npm run test:watch           # ファイル変更監視
npm run test:ui              # ブラウザUIで実行
```
````

### Workers 統合テスト（`tests/workers/`）

実 workerd ランタイムで実行。`@cloudflare/vitest-pool-workers` 経由。

```bash
npx vitest run --config vitest.workers.config.ts
```

## テスト対象の範囲

- **`unit/actions-schema.test.ts`**: Astro Actions の Zod バリデーション
- **`unit/supabase-client.test.ts`**: Supabase クライアント初期化ロジック
- **`unit/middleware.test.ts`**: `/member` 配下の認可ロジック
- **`integration/pages.test.ts`**: Astro コンポーネントのレンダリング
- **`workers/env.test.ts`**: Workers ランタイムでの環境変数取得

## 既知の制約

- Astro 6 では Astro コンポーネントのテストは `environment: 'node'` 必須
  （`jsdom` や `happy-dom` では動作しない）
- Supabase への実接続テストは含まない。
  E2E で Supabase のテストプロジェクトを使う方針は将来検討。

## 将来追加を推奨するテスト

本テンプレートには含めていないが、セキュリティ上重要なため将来追加を推奨:

- **RLS テスト**: `profiles.role` 列が authenticated ロールから UPDATE できないこと
  （`revoke update (role)` が効いているか）を検証する統合テスト。
  Supabase CLI の `supabase test db` または、テスト用 Supabase プロジェクトに
  対する pgTAP テストで実装できる。
- **E2E テスト**: Playwright によるサインアップ → メール確認 → ログインの
  実フロー確認。

````

---

## ④ 出力ステップ

ファイルが多いので、2ステップに分けて出力:

### Step 1: Lint / Format / 設定ファイル

- インストールコマンドの提示
- `package.json` の `scripts` 追記
- `.gitignore` 追記
- `eslint.config.js`
- `.prettierrc.mjs`
- `.prettierignore`
- `vitest.config.ts`
- `vitest.workers.config.ts`

### Step 2: テストファイル

- `tests/unit/actions-schema.test.ts`
- `tests/unit/supabase-client.test.ts`
- `tests/unit/middleware.test.ts`
- `tests/integration/pages.test.ts`
- `tests/workers/env.test.ts`
- `tests/README.md`

各ステップの末尾に **「次のステップに進む準備ができました」** と表示して待機する。

---

## ⑤ 完了後の動作確認手順（最後に表示）

Step 2 の出力後、以下のセクションを Claude Code が表示:

```markdown
## ✅ 品質保証環境の構築完了

### 依存をインストール
npm install

### Lint と Format をチェック
npm run lint
npm run format:check

### Format を自動修正
npm run format
npm run lint:fix

### 型チェック
npm run typecheck

### テスト実行
npm run test                                                 # ユニット・統合
npx vitest run --config vitest.workers.config.ts             # Workers

### 期待される結果
- Lint: エラーなし（警告は許容）
- Format: 全ファイルが整形済み
- Typecheck: エラーなし
- Unit/Integration: 全テストが緑
- Workers: env.test.ts が緑

もし Lint エラーが出る場合、Phase 1 のコードが ESLint のルールに
完全準拠していない可能性がある。その場合は npm run lint:fix で
自動修正できる範囲は修正し、残りは個別に対応する。
````

---

## ⑥ 引き継ぎメモ

| 項目                | 誤り                             | 正しい                                      |
| ------------------- | -------------------------------- | ------------------------------------------- |
| ESLint 設定形式     | `.eslintrc.js` / `.eslintrc.cjs` | `eslint.config.js`（Flat Config）           |
| Vitest 環境         | `environment: 'jsdom'`           | `environment: 'node'`（Astro 6 で必須）     |
| Vitest 設定         | 自前の `defineConfig`            | `getViteConfig()`（Astro 公式ヘルパー）     |
| Workers テスト      | `miniflare` 直接利用             | `@cloudflare/vitest-pool-workers`           |
| Prettier Astro      | `prettier-plugin-astro` なし     | `prettier-plugin-astro` を plugins に含める |
| Tailwind クラス整列 | 手動                             | `prettier-plugin-tailwindcss` が自動整列    |
