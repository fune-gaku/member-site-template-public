# 現在のフェーズ: Phase 3

## Phase 3: 会員 CRUD + 管理者機能の充実

**ステータス**: ✅ 完了
**開始日**: 2026-04-18
**完了日**: 2026-04-18
**ブランチ**: `feature/member-crud-and-admin`

---

## 目標

Phase 1〜2 で整備した基盤（認証・Storage・RLS・品質保証）の上に、テンプレート利用者にそのまま使える「会員投稿 CRUD」と「管理者によるユーザー管理」機能を実装する。ダッシュボードはモックを排除してシンプル化し、テンプレートとしての見通しを良くする。

---

## タスク

### タスク A: member_posts の CRUD 完全実装（モック撤去）

- [x] Actions に `posts` 名前空間を追加
  - `posts.create({ title, body? })`
  - `posts.update({ id, title, body? })`
  - `posts.delete({ id })`
  - いずれも認証必須。`user_id` は `auth.getUser()` から導出し、クライアント入力を信頼しない
  - Zod で入出力バリデーション
- [x] `src/components/PostForm.vue` を新設（新規作成 / 編集を 1 コンポーネントで兼用）
  - フロント側も Zod で再バリデーション
  - `editingPost` prop が渡されれば編集モード
- [x] `src/components/PostList.vue` を新設（SampleDataTable.vue は削除）
  - SSR から受け取る `initialPosts` を初期表示
  - 行単位の「編集」「削除」ボタン
  - 削除時は `window.confirm` で確認
- [x] `src/pages/member/data.astro` を SSR 事前取得に変更
  - サーバーで `supabase.from("member_posts").select(...)` を実行し `initialPosts` として注入
  - 作成フォーム・一覧・編集・削除を同一画面で完結

### タスク B: 権限ごとの画面呼び出し（admin ロール）

- [x] `src/middleware.ts` を拡張
  - 認証済みユーザーかつ `/member` または `/admin` 配下のアクセスでのみ `profiles.role` を取得
  - `Astro.locals.profile = { role }` を設定
  - `/admin/*` は role !== "admin" なら `/member/dashboard` にリダイレクト
  - 未認証は `/auth/signin?next=<path>` にリダイレクト
  - `/` や `/auth/` では role を取得しないことで余計な DB 問い合わせを避ける
- [x] `src/env.d.ts` の `App.Locals` に `profile` 型を追加
- [x] Actions に admin を追加・拡張
  - `admin.listUsers({ page?, perPage? })`: service_role で `auth.admin.listUsers()` を呼び、`profiles` と突合して role / display_name を付与して返す
  - `admin.updateUserRole({ userId, role })`: service_role 経由で `profiles.role` を更新。**自分自身の role 変更は禁止**
  - 共通の `requireAdmin(context)` ヘルパーで、認証＋role === "admin" を先頭で検証
  - 既存の `admin.createUser` / `admin.inviteUser` も `requireAdmin` に統合
- [x] `src/pages/admin/users.astro` を新設
  - 招待フォーム + ユーザー一覧 + 各行の role 切り替えボタン
  - 自分自身の行はボタンを disabled + "自分" バッジ表示
- [x] `src/components/InviteUserForm.vue` / `src/components/AdminUserList.vue` / `src/components/AdminUsersPanel.vue`（ラッパー）を新設
- [x] `src/layouts/Admin.astro` を新設（Member.astro をベースに、背景色を変えて admin と視覚的に区別、「会員サイトに戻る」リンクを配置）
- [x] `src/layouts/Member.astro` ヘッダーに admin のみに表示される「管理画面」リンクを追加

### タスク C: ダッシュボード簡素化

- [x] `src/pages/member/dashboard.astro` から総アクセス数 / 投稿数 / アクティビティ等のモック数値を削除
- [x] 残したもの: ウェルカムメッセージ + クイックアクション（プロフィール編集 / データ / サインアウト / 管理画面(admin のみ)）

---

## 動作確認結果

### Lint

```bash
npm run lint
```

**結果**: 新規追加コードはすべてクリア。既存の軽微なエラー 3 件（`astro.config.mjs` の process 未定義、`env.d.ts` の import() 型注釈、`signout.astro` の未使用変数）はすべて本タスク以前から存在。

### Format

```bash
npm run format:check
```

**結果**: `All matched files use Prettier code style!`

### Typecheck

```bash
npm run typecheck
```

**結果**: 新規追加コードによる新規型エラーなし。既存の 4 エラー（`cloudflare:workers` の型解決 ×2、既存ページ 2 件）と Phase 2 から知られている Zod deprecation warning のみ残存。

### Test

```bash
npm run test
```

**結果**: 28 テスト全てパス（Phase 2 の 15 テスト → 28 テストに増加）

- `tests/unit/actions-schema.test.ts`: 13 テスト（posts / admin.updateUserRole のスキーマ検証を追加）
- `tests/unit/middleware.test.ts`: 6 テスト（`/admin` 配下の認可ケースを追加）
- `tests/unit/supabase-client.test.ts`: 4 テスト
- `tests/integration/pages.test.ts`: 3 テスト
- 計 4 ファイル / 28 テスト

### 手動疎通確認（curl）

ブラウザ操作環境がないため `curl` で主要ルートを検証：

- `GET /` → 200 OK
- `GET /member/dashboard`（未認証）→ 302 `/auth/signin?next=%2Fmember%2Fdashboard`
- `GET /member/data`（未認証）→ 302 `/auth/signin?next=%2Fmember%2Fdata`
- `GET /admin/users`（未認証）→ 302 `/auth/signin?next=%2Fadmin%2Fusers`
- `GET /auth/signin` → 200 OK（フォームレンダリング確認）
- `POST /_actions/posts.create`（未認証）→ 401 `AstroActionError UNAUTHORIZED`
- `POST /_actions/posts.create`（空 title）→ 400 Zod バリデーションエラー（日本語メッセージ）
- `POST /_actions/admin.listUsers`（未認証）→ 401
- `POST /_actions/admin.updateUserRole`（未認証）→ 401

### npm audit

**結果**: high 以上の脆弱性なし（moderate 5 件は既存で `@astrojs/check` 経由の dev 依存、ランタイム影響なし）

---

## セキュリティチェック

`.claude/security.md` のチェックリストに対する本タスクの確認結果：

| 項目                                    | 結果 | 備考                                                                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| 新規 Actions すべてに認証チェック       | OK   | `posts.*` / `admin.*` すべてで `auth.getUser()` または `requireAdmin()`                                |
| admin 系 Actions すべてに role チェック | OK   | `requireAdmin` を先頭で呼び出し                                                                        |
| user_id はサーバー側で導出              | OK   | `posts.*` はクライアント入力を受け取らず `caller.id` を使用                                            |
| role 更新は supabaseAdmin 経由のみ      | OK   | `createAdminClient()` で service_role を使用。`authenticated` ロールからは `revoke update (role)` 済み |
| 自己 role 変更の禁止                    | OK   | `admin.updateUserRole` の handler と UI の両方でガード                                                 |
| v-html 未使用                           | OK   | 全 Vue コンポーネントで `{{ }}` のみ（自動エスケープ）                                                 |
| Zod フロント・バック両方                | OK   | `PostForm.vue` / `InviteUserForm.vue` 側でも再バリデーション                                           |
| エラーメッセージに内部情報が露出しない  | OK   | ユーザー向けはフレンドリー、詳細は `console.error` のみ                                                |
| .env / .dev.vars をコミットしない       | OK   | 変更なし（`.gitignore` 済み）                                                                          |
| 重大脆弱性なし                          | OK   | `npm audit --audit-level=high` でヒットなし                                                            |

---

## 成果物

### 新規ファイル

- `src/components/PostForm.vue`
- `src/components/PostList.vue`
- `src/components/InviteUserForm.vue`
- `src/components/AdminUserList.vue`
- `src/components/AdminUsersPanel.vue`
- `src/layouts/Admin.astro`
- `src/pages/admin/users.astro`

### 変更ファイル

- `src/actions/index.ts` - `posts.*` / `admin.listUsers` / `admin.updateUserRole` / `requireAdmin` 追加
- `src/middleware.ts` - role 取得 + `/admin` 配下のガード追加
- `src/env.d.ts` - `App.Locals.profile` 型追加
- `src/layouts/Member.astro` - admin のみ「管理画面」リンク表示
- `src/pages/member/data.astro` - SSR 事前取得 + PostList 連携
- `src/pages/member/dashboard.astro` - モック数値を撤廃してクイックアクション中心に
- `tests/unit/actions-schema.test.ts` - posts / admin.updateUserRole のテスト追加
- `tests/unit/middleware.test.ts` - `/admin` 配下の認可テスト追加

### 削除ファイル

- `src/components/SampleDataTable.vue`（PostList.vue に置き換え）

### DB マイグレーション

- **追加なし**。既存の `001_init.sql` にある `profiles` と `member_posts` の RLS / カラムレベル権限で要件を満たす
- `admin.updateUserRole` は service_role 経由で `profiles.role` を更新するため、`revoke update (role) from authenticated` の保護を壊さない

---

## 残課題 / 今後の推奨

1. `supabase-admin.ts` や `env.test.ts` で `cloudflare:workers` 型解決が走らない typecheck エラー（既存）
2. Zod `.email()` `.uuid()` の deprecation 警告（Phase 2 で既知）→ 新 API（`z.email()` / `z.uuid()`）へ段階移行する選択肢あり
3. ページネーション UI：`admin.listUsers` はサーバー側で `page` / `perPage` を受け取れるが、UI は最初の 1 ページ（最大 100 件）のみ表示。ユーザー数が増えた場合の改善候補
4. `posts` のページネーション・検索 UI：現時点は全件取得なので、大量投稿のテナントには別途ページネーション対応を推奨

---

## メモ

- テンプレート方針として、マイグレーション追加を避けて既存 RLS を活用する設計を優先した。admin 操作は全て service_role 経由（Supabase 公式推奨）。
- `Admin.astro` は Member と視覚的に区別するためヘッダーを濃色に統一し、`ADMIN` バッジを常時表示することで誤操作を防止。
- Middleware 内の `profile` 取得はパス判定の後で行うので、非会員エリア（`/`, `/auth/*`, `/api` など）ではゼロコスト。
