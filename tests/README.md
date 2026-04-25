# テスト構成

## テストの種類

### ユニット/統合テスト（`tests/unit/` と `tests/integration/`）

Vitest + Astro の `getViteConfig()` で実行。Node 環境。

```bash
npm run test                 # 1回実行
npm run test:watch           # ファイル変更監視
npm run test:ui              # ブラウザUIで実行
```

### Workers 統合テスト（`tests/workers/`）

実 workerd ランタイムで実行。`@cloudflare/vitest-pool-workers` 経由。
事前に `astro build` で `dist/server/` を生成する必要があるため、
`npm run test:workers` は内部で `npm run build` を呼んでから vitest を起動する。

```bash
npm run test:workers
```

CSRF テスト（`tests/workers/csrf.test.ts`）は実 Worker 上で
`security.checkOrigin` の発火を検証するため、build 出力 (`dist/server/wrangler.json`)
を miniflare に読み込ませる必要がある。`vitest.workers.config.ts` の
`wrangler.configPath` がこれを参照しているので、`npm run build` を経由しない
直接実行（例: `npx vitest run --config vitest.workers.config.ts`）は dist が
古い状態だと挙動がずれる点に注意。

## テスト対象の範囲

- **`unit/actions-schema.test.ts`**: Astro Actions の Zod バリデーション
- **`unit/supabase-client.test.ts`**: Supabase クライアント初期化ロジック
- **`unit/middleware.test.ts`**: `/member` 配下の認可ロジック
- **`integration/pages.test.ts`**: Astro コンポーネントのレンダリング
- **`integration/signout-csrf.test.ts`**: `/auth/signout` の GET / その他 safe method が 405 + Allow: POST を返す（CSRF 防御）
- **`workers/env.test.ts`**: Workers ランタイムでの環境変数取得
- **`workers/csrf.test.ts`**: 実 Worker 上で `security.checkOrigin` がクロスオリジン POST を 403 で拒否する（CSRF 防御）

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
