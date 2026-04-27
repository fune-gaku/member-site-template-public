# テスト構成

3 系統のテストがある:

| 系統           | ディレクトリ                        | ランタイム                        | 検証対象                                                                   |
| -------------- | ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| Unit/統合      | `tests/unit/`, `tests/integration/` | Vitest + Node                     | TypeScript のロジック、Astro コンポーネント SSR、Action Zod バリデーション |
| Workers 統合   | `tests/workers/`                    | `@cloudflare/vitest-pool-workers` | 実 workerd ランタイムでの環境変数取得、CSRF (`security.checkOrigin`) 等    |
| **DB (pgTAP)** | `supabase/tests/database/`          | Supabase CLI + pg_prove           | RLS / トリガー / CHECK 制約 / 列レベル権限など、SQL 不変条件               |

DB テストの書き方は [.claude/database.md「pgTAP テスト Author ガイド」](../.claude/database.md#pgtap-テスト-author-ガイド) 参照。雛形は [.claude/templates/pgtap.test.sql.tmpl](../.claude/templates/pgtap.test.sql.tmpl)。

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

### DB テスト（`supabase/tests/database/`）

pgTAP + `pg_prove` で SQL 不変条件を検証する。`supabase test db` がローカル DB
(Docker stack) に対して実行する。

```bash
npm run db:start           # 初回のみ
npm run db:reset           # 全マイグレーション再適用
npm run db:test            # supabase test db (= pg_prove)
```

カバレッジ:

| ファイル                               | 検証する不変条件                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `000-setup-tests-hooks.sql`            | pgTAP install + 最小ヘルパー (`tests.create_supabase_user` / `authenticate_as` / `get_supabase_uid` / `clear_authentication`) |
| `010-profiles-role-revoke.test.sql`    | `profiles.role` への UPDATE が authenticated から拒否される / 安全カラムは UPDATE 可 / `service_role` は更新可                |
| `020-profiles-rls.test.sql`            | `profiles` の SELECT / UPDATE RLS が他ユーザーの行を不可視・不可変に絞る                                                      |
| `030-member-posts-rls.test.sql`        | `member_posts` の SELECT / INSERT / UPDATE / DELETE RLS                                                                       |
| `040-storage-avatars-rls.test.sql`     | `storage.objects` の avatars バケットでフォルダ単位の SELECT / INSERT 制限                                                    |
| `050-handle-new-user-trigger.test.sql` | `auth.users` への INSERT で `profiles` 行が自動生成 / `display_name` の meta data 抽出                                        |
| `060-display-name-check.test.sql`      | `profiles.display_name` の 100 文字 CHECK 制約                                                                                |

### `npm run test:all` 相当

Issue #36 で `db-test.yml` workflow が追加されると CI でも全 3 系統が走る。
ローカルでは `/db-check` slash command が `db:reset` → `db:lint` → `db:test`
を一括実行する。

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

- **CI で pgTAP 実行**: 現状 DB テストはローカル / `/db-check` のみ。Issue #36
  で `.github/workflows/db-test.yml` を追加し、`supabase/**` を変更した PR で
  自動実行する予定。
- **E2E テスト**: Playwright によるサインアップ → メール確認 → ログインの
  実フロー確認。
