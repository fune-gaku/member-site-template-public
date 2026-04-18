# 現在のフェーズ: Phase 1

## Phase 1: 会員サイト本体実装

**ステータス**: 🔄 進行中（Step 1完了）
**開始日**: 2026-04-18
**完了予定日**: TBD

---

## 目標

Supabase認証・Storage・RLS・会員ページの本体機能を実装し、動作する会員サイトを構築する。

---

## タスク

### ✅ 完了
- [x] **Step 1**: 設定ファイル・ライブラリ・Actions の実装
  - Astro SSRモード有効化
  - Supabase クライアント（サーバー/ブラウザ/Admin）実装
  - 認証ミドルウェア実装
  - Astro Actions（認証・ストレージ・管理者機能）実装
  - 環境変数設定ファイル作成

### 🔄 進行中
- [ ] **Step 2**: Layouts と Vue コンポーネントの実装
- [ ] **Step 3**: Pages と SQL マイグレーションの実装

---

## 動作確認項目

- [ ] ローカル開発サーバーが起動する
- [ ] サインアップ → 確認メール受信 → リンククリック
- [ ] ログイン → `/member/dashboard` にリダイレクト
- [ ] アバターアップロード・表示
- [ ] サンプルデータ（member_posts）の取得・表示

---

## セキュリティチェック

コミット前に[security.md](../security.md)のチェックリストを確認。

重点項目:
- [x] 環境変数がハードコードされていない
- [x] `.env` と `.dev.vars` が `.gitignore` に含まれる
- [x] `SUPABASE_SERVICE_ROLE_KEY` はサーバーのみで使用
- [ ] RLS ポリシーが正しく設定されている

---

## 実装上の注意点

### 重要な仕様
- **Astro 6**: `Astro.locals.runtime.env` 削除 → `import { env } from 'cloudflare:workers'`
- **Supabase SSR**: `@supabase/ssr` の `createServerClient`/`createBrowserClient` を使用
- **Admin クライアント**: モジュールスコープで初期化しない（毎リクエスト生成）
- **Zod**: `astro/zod` からインポート（`zod` ではない）
- **認証**: 全ページで `getUser()` を呼び出してトークン自動リフレッシュ

### Tailwind CSS 4
- `@theme` ブロックで変数定義
- brand カラー（brand-50〜700）を使用

---

## 次のPhase

Phase 2: 品質保証（ESLint + Prettier + Vitest セットアップ）

---

## メモ

- Phase 0（基盤構築）は完了済み
- Step 1でコアな認証・ストレージ機能を実装完了
- Step 2-3でUI/UXを完成させる
