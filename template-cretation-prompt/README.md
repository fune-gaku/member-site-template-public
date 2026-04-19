# 会員サイトテンプレート実装プロンプト一式

Astro 6 + Vue + Supabase + Cloudflare Workers での会員サイト構築を
3フェーズに分けて実装するためのプロンプト集。

## 📋 フェーズ構成

| フェーズ    | ファイル                        | 実行者             | 所要時間目安 |
| ----------- | ------------------------------- | ------------------ | ------------ |
| **Phase 0** | `phase0-initialization.md`      | **あなた（手動）** | 10-15分      |
| **Phase 1** | `phase1-main-implementation.md` | Claude Code        | 20-30分      |
| **Phase 2** | `phase2-quality-assurance.md`   | Claude Code        | 15-20分      |

## 🔄 実行フロー

```
┌─────────────────────────────────────────┐
│ Phase 0: 初期化（手動）                   │
│  - npm create astro@latest               │
│  - npx astro add cloudflare/vue/tailwind │
│  - npm install @supabase/*               │
│  - Supabase ダッシュボード設定            │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Phase 1: 本体実装（Claude Code）          │
│  Step 1: 設定・lib・actions              │
│  Step 2: layouts・components             │
│  Step 3: pages・SQL                      │
│  → 動作確認                               │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Phase 2: 品質保証（Claude Code）          │
│  Step 1: Lint/Format/Vitest設定          │
│  Step 2: テストファイル                   │
│  → lint/format/test で全グリーン          │
└─────────────────────────────────────────┘
```

## 🎯 Claude Code への渡し方

Phase 1 と Phase 2 は Claude Code に渡すときに、以下の順で添付する:

1. **プロジェクトコンテキスト**（`.claude/CLAUDE.md`、`.claude/architecture.md` 等）
2. **Phase のプロンプト本文**（`phase1-main-implementation.md` または `phase2-quality-assurance.md`）

これにより Claude Code は:

- プロジェクト固有のタグライン、命名規則、デザイン方針などをコンテキストから取得
- プロンプト側は技術実装指示に集中

## ✅ 各フェーズの完了条件

### Phase 0 完了

- [ ] `npm run dev` で開発サーバが起動
- [ ] Astro デフォルトページが表示される
- [ ] Supabase の URL / Publishable Key / Service Role Key をメモ済み

### Phase 1 完了

- [ ] `.env` と `.dev.vars` が設定済み
- [ ] マイグレーション `001_init.sql` を実行済み
- [ ] サインアップ → 確認メール → ログイン → `/member/dashboard` の一連の流れが動作
- [ ] 未認証で `/member/*` にアクセスすると `/auth/signin` にリダイレクトされる

### Phase 2 完了

- [ ] `npm run lint` が成功
- [ ] `npm run format:check` が成功
- [ ] `npm run typecheck` が成功
- [ ] `npm run test` で全テストが緑
- [ ] `npx vitest run --config vitest.workers.config.ts` で Workers テストが緑

## 🚀 デプロイ

Phase 0-2 がすべて完了したら:

1. GitHub にリポジトリを作成
2. `git push` でリポジトリへpush
3. Cloudflare ダッシュボード → Workers & Pages → Create application
4. GitHub 連携で対象リポジトリを選択
5. Build command: `npx astro build`
6. Deploy command: `npx wrangler@latest deploy`
7. Build variables に `PUBLIC_SUPABASE_URL` と `PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定
8. Secrets に `SUPABASE_SERVICE_ROLE_KEY` を設定
9. Save and Deploy

以降は `git push origin main` で自動デプロイされる。

## 📝 拡張（将来のフェーズ）

必要に応じて追加可能:

- **Phase 3**: Playwright での E2E テスト
- **Phase 4**: GitHub Actions で lint/test を pre-deploy チェック
- **Phase 5**: Supabase CLI での RLS テスト（`supabase test db`）
