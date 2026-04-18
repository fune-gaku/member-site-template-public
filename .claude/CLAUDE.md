# Astro Vue Supabase Cloudflare Template

## 概要

Astro + Vue + Supabase + Cloudflare Workers を使った会員サイトテンプレート（SSR・認証・Storage・Admin機能完備）

**使用者**: テンプレート利用者（開発者および利用企業）
**方針**: 型安全で公式推奨の実装パターンを厳守し、セキュリティとメンテナンス性を最優先

**現在のフェーズ**: Phase 1（会員サイト本体実装） - ✅ 完了 → [詳細](phases/current.md)

---

## ドキュメント構成

- **[architecture.md](architecture.md)** - アーキテクチャ・技術スタック・ディレクトリ構成
- **[database.md](database.md)** - データベーススキーマ・テーブル定義・ビュー
- **[security.md](security.md)** - セキュリティガイドライン・チェックリスト
- **[development.md](development.md)** - 開発ルール・コーディング規約・命名規則
- **[deployment.md](deployment.md)** - デプロイ手順（Cloudflare Workers）
- **[phases/](phases/)** - Phase別開発記録

---

## クイックスタート

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .envファイルに必要な情報を設定

# 開発サーバー起動
npm run dev
```

---

## 環境変数

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `PUBLIC_SUPABASE_URL` | Supabase Project URL（公開値） | Supabase Dashboard > Settings > API > Project URL |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key（公開値） | Supabase Dashboard > Settings > API > anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key（秘密値） | Supabase Dashboard > Settings > API > service_role secret<br/>ローカル: `.dev.vars` に記載<br/>本番: `wrangler secret put` または Cloudflare Dashboard |

---

## 重要な注意事項

### セキュリティ
- **環境変数は.envファイルのみに記載**（コミット前に必ず確認）
- **コミット前に[セキュリティチェックリスト](security.md)を確認**
- API KeyやSecretをハードコードしない

### データベース
- **RLS（Row Level Security）を必ず有効化**すること
- マイグレーションファイルは `supabase/migrations/` に配置
- 本番適用はSupabase SQL Editorから手動実行
- `profiles`, `member_posts` テーブルとStorage `avatars` バケットを使用

### 開発フロー
1. 各Phase開始前にプランを確認
2. 実装中は[開発ルール](development.md)に従う
3. Phase完了時にセキュリティチェック
4. 完了記録を`phases/phaseN.md`に残す
5. コミット・プッシュ

### 最新情報・不明な情報の確認ルール

**重要**: Claude Codeの知識カットオフ（2025年1月）以降の情報や、不確実な情報については、**必ず公式ドキュメントまたはスキルを利用して確認**してください。

#### 確認が必要な技術

| 技術 | 確認方法 | 理由 |
|------|---------|------|
| Astro 6.x | [公式ドキュメント](https://docs.astro.build/) | 2025年リリース、APIに破壊的変更あり |
| Supabase SSR (`@supabase/ssr`) | [公式ドキュメント](https://supabase.com/docs/guides/auth/server-side) | 旧auth-helpersから移行 |
| Cloudflare Workers | [公式ドキュメント](https://developers.cloudflare.com/workers/) | `runtime` API削除など仕様変更 |
| Tailwind CSS 4.x | [公式ドキュメント](https://tailwindcss.com/docs) | `@theme`による新しい設定方法 |

#### 確認手順

```
1. 実装前に技術仕様を確認
   ↓
2. 不明・不確実な点がある場合
   ↓
3. 公式ドキュメント検索 or MCP Skillを使用
   ↓
4. 最新情報に基づいて実装
   ↓
5. 動作確認
```

#### 使用可能なツール

- **公式ドキュメント検索**: MCP Skillまたは公式サイト
- **WebFetch**: 公式ドキュメントURL指定で最新情報取得
- **WebSearch**: 最新のベストプラクティス・トラブルシューティング検索

**例**:
```
❌ 古い知識で実装 → エラー発生 → 修正に時間がかかる
✅ 事前に公式ドキュメント確認 → 正しい実装 → スムーズな開発
```

---

## 開発フェーズ

| Phase | 内容 | ステータス |
|-------|------|----------|
| Phase 0 | プロジェクト基盤構築 | ✅ 完了 |
| Phase 1 | 会員サイト本体実装（認証・Storage・RLS・UI） | ✅ 完了 |
| Phase 2 | 品質保証（ESLint, Prettier, Vitest） | 📋 予定 |
| Phase 3 | 本番デプロイ | 📋 予定 |

---

## よくある質問

### Q. ローカル開発でエラーが発生する
A. `.env`ファイルに必要な環境変数が正しく設定されているか確認してください。

### Q. ビルドエラーが発生する
A. `npm install`で依存関係を再インストールしてください。

---

## サポート

問題が発生した場合は、以下を確認してください：
1. [セキュリティガイドライン](security.md)
2. [開発ルール](development.md)
3. エラーログの内容
4. 外部サービスのダッシュボード・ログ
