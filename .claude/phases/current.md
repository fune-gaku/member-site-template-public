# 現在のフェーズ: Phase 1

## Phase 1: 会員サイト本体実装

**ステータス**: ✅ 完了
**開始日**: 2026-04-18
**完了日**: 2026-04-18

---

## 目標

Supabase認証・Storage・RLS・会員ページの本体機能を実装し、動作する会員サイトを構築する。

---

## タスク

### ✅ 完了
- [x] **Step 1**: 設定ファイル・ライブラリ・Actions の実装
  - Astro SSRモード有効化（`output: 'server'`）
  - Supabase クライアント（サーバー/ブラウザ/Admin）実装
  - 認証ミドルウェア実装（トークン自動リフレッシュ）
  - Astro Actions（認証・ストレージ・管理者機能）実装
  - 環境変数設定ファイル作成（.env.example, .dev.vars.example）

- [x] **Step 2**: Layouts と Vue コンポーネントの実装
  - Base/Auth/Member レイアウト作成
  - SignupForm（確認メール送信）
  - LoginForm（リダイレクト処理）
  - ProfileForm（アバターアップロード・プロフィール編集）
  - SampleDataTable（member_posts データ表示）

- [x] **Step 3**: Pages と SQL マイグレーションの実装
  - ランディングページ（index.astro）
  - 認証ページ（signup/signin/reset-password/callback/signout）
  - 会員ページ（dashboard/profile/data）
  - SQL初期マイグレーション（001_init.sql）
    - profiles テーブル + RLS + トリガー
    - member_posts テーブル + RLS
    - avatars バケット + RLS

---

## 動作確認項目

動作確認は以下の手順で行ってください：

1. **環境変数設定**
   ```bash
   cp .env.example .env
   cp .dev.vars.example .dev.vars
   # 実際の値を設定
   ```

2. **Supabase マイグレーション適用**
   - Supabase ダッシュボードの SQL Editor で `supabase/migrations/001_init.sql` を実行

3. **開発サーバー起動**
   ```bash
   npm run dev
   ```

4. **動作確認**
   - [ ] ローカル開発サーバーが起動する（http://localhost:4321）
   - [ ] ランディングページが表示される
   - [ ] サインアップ → 確認メール受信 → リンククリック → ダッシュボードへ
   - [ ] ログイン → `/member/dashboard` にリダイレクト
   - [ ] プロフィール編集（表示名変更）
   - [ ] アバターアップロード・表示
   - [ ] データページでサンプルデータ（member_posts）の取得・表示
   - [ ] サインアウト → トップページへリダイレクト

---

## セキュリティチェック

実装時に確認した項目:
- [x] 環境変数がハードコードされていない
- [x] `.env` と `.dev.vars` が `.gitignore` に含まれる
- [x] `SUPABASE_SERVICE_ROLE_KEY` はサーバーのみで使用（`cloudflare:workers` の `env`）
- [x] RLS ポリシーが正しく設定されている
  - profiles: 自分のプロファイルのみ閲覧・更新可能
  - member_posts: 自分の投稿のみ CRUD 可能
  - avatars: 自分のフォルダのみアクセス可能
- [x] role 列の権限昇格攻撃を防止（`revoke update (role)` でカラムレベル権限制御）
- [x] Admin クライアントは毎リクエスト生成（モジュールスコープ初期化を回避）
- [x] 認証ミドルウェアで全ページでトークン自動リフレッシュ

---

## 実装上の注意点

### 重要な仕様
- **Astro 6**: `Astro.locals.runtime.env` 削除 → `import { env } from 'cloudflare:workers'`
- **Supabase SSR**: `@supabase/ssr` の `createServerClient`/`createBrowserClient` を使用
- **Admin クライアント**: モジュールスコープで初期化しない（毎リクエスト生成）
- **Zod**: `astro/zod` からインポート（`zod` ではない）
- **認証**: 全ページで `getUser()` を呼び出してトークン自動リフレッシュ

### Tailwind CSS 4
- `@theme` ブロックで変数定義（global.css）
- brand カラー（brand-50〜700）を使用

### 実装したファイル数
- **設定ファイル**: 7個（.nvmrc, .env.example, .dev.vars.example, env.d.ts など）
- **ライブラリ**: 4個（supabase.ts, supabase-browser.ts, supabase-admin.ts, middleware.ts）
- **Actions**: 1個（index.ts - 11個のアクション）
- **Layouts**: 3個（Base.astro, Auth.astro, Member.astro）
- **Vue コンポーネント**: 4個（SignupForm, LoginForm, ProfileForm, SampleDataTable）
- **Pages**: 10個（index + auth/* + member/*）
- **SQL**: 1個（001_init.sql - 3テーブル + RLS + トリガー）

---

## 次のPhase

Phase 2: 品質保証（ESLint + Prettier + Vitest セットアップ）

動作確認が完了したら、Phase 2に進んでコード品質とテストを向上させます。

---

## メモ

### Phase 1 完了時の状態
- ✅ Phase 0（基盤構築）完了
- ✅ Phase 1（会員サイト本体実装）完了
  - Step 1: 設定・ライブラリ・Actions
  - Step 2: Layouts・Vue コンポーネント
  - Step 3: Pages・SQL マイグレーション
- 📋 Phase 2（品質保証）準備完了

### 実装時の工夫
- Vue コンポーネントは完全に型安全（TypeScript）
- エラーハンドリングとローディング状態を全てのフォームに実装
- Tailwind CSS 4 の `@theme` でデザイントークンを統一
- RLS ポリシーでセキュアなデータアクセス制御
- 権限昇格攻撃（Privilege Escalation）をカラムレベル権限で防止
