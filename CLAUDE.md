# Astro Vue Supabase Cloudflare Template

## 概要

Astro + Vue + Supabase + Cloudflare Workers を使った会員サイトテンプレート（SSR・認証・Storage・Admin機能完備）

**使用者**: テンプレート利用者（開発者および利用企業）
**方針**: 型安全で公式推奨の実装パターンを厳守し、セキュリティとメンテナンス性を最優先

---

## ドキュメント構成

### 常時参照（Claude Code 起動時に自動読み込み）

以下のファイルは Claude Code の `@import` 構文によりこの CLAUDE.md と同時にコンテキストへ展開される。実装・レビュー・コミットの判断材料として常に手元にある前提で参照してよい。

@.claude/security.md
@.claude/development.md

### 必要時に参照（明示的に Read で開く）

下記は通常はコンテキストに入っていないため、関連作業に着手する直前に `Read` で開くこと。

- **[architecture.md](.claude/architecture.md)** - アーキテクチャ・技術スタック・ディレクトリ構成
- **[database.md](.claude/database.md)** - データベーススキーマ・テーブル定義・ビュー
- **[deployment.md](.claude/deployment.md)** - デプロイ手順（Cloudflare Workers）

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

| 変数名                            | 説明                                | 取得方法                                                                                                                                               |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_SUPABASE_URL`             | Supabase Project URL（公開値）      | Supabase Dashboard > Settings > API > Project URL                                                                                                      |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key（公開値）  | Supabase Dashboard > Settings > API > anon public                                                                                                      |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase Service Role Key（秘密値） | Supabase Dashboard > Settings > API > service_role secret<br/>ローカル: `.dev.vars` に記載<br/>本番: `wrangler secret put` または Cloudflare Dashboard |

---

## 重要な注意事項

### セキュリティ

- **環境変数は.envファイルのみに記載**（コミット前に必ず確認）
- **コミット前に[セキュリティチェックリスト](.claude/security.md)を確認**
- API KeyやSecretをハードコードしない

### データベース

- **RLS（Row Level Security）を必ず有効化**すること
- マイグレーションファイルは `supabase/migrations/` に配置
- 本番適用はSupabase SQL Editorから手動実行
- `profiles`, `member_posts` テーブルとStorage `avatars` バケットを使用

### 開発フロー

1. 着手前に Plan mode で実装方針を提示し、合意してから実装に入る
2. 実装中は development.md / security.md（@import 済み）に従い、サブタスクは TodoWrite で追跡
3. コミット前に security.md のチェックリストを確認
4. コミット本文に「なぜそうしたか」を記述（Why は git log に残し、What はコードを読めば分かる前提）
5. **main マージ前に必ず** [security.md「セキュリティレビュー手順（必須）」](.claude/security.md#セキュリティレビュー手順必須) を実行（`/security-review` → OpenAI Codex → Claude Code 統合レビュー）。結果を PR description に貼る
6. プッシュ

### 最新情報・不明な情報の確認ルール

**重要**: モデルの知識は学習時点で固定されている。以下に該当するときは **必ず一次情報で検証** してから実装に反映する。

- 直近のメジャーバージョン（Astro 6 / Tailwind 4 等）の API 仕様・設定方法
- 「破壊的変更があった」と記憶している API（その差分の正確な形）
- バージョン番号・引数名・フラグ名のような細部
- 自分の記憶通りに動かないとき（旧 API を引きずっていないか確認）

#### 確認手段の優先順位

| 優先 | 対象技術                                              | 推奨ツール                                                       |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | Astro 6                                               | `mcp__astro-docs__search_astro_docs` Skill（環境にあれば最優先） |
| 1    | Supabase / Cloudflare Workers / Tailwind 4 / Vue 3 等 | `WebFetch` で公式ドキュメント URL を直接取得                     |
| 2    | 一般的なベストプラクティス・既知の不具合              | `WebSearch`（公式 issue や stackoverflow を含めて検索）          |

#### 公式ドキュメント主要 URL

- Astro 6: https://docs.astro.build/
- Astro Cloudflare アダプター: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Tailwind CSS 4: https://tailwindcss.com/docs
- Vue 3: https://vuejs.org/

#### 手順

1. 実装前に該当箇所が「最新情報の対象」か判定
2. 対象なら一次情報を取得（Skill > WebFetch > WebSearch の順）
3. 取得した情報に基づき実装
4. ローカルで動作確認

---

## よくある質問

### Q. ローカル開発でエラーが発生する

A. `.env`ファイルに必要な環境変数が正しく設定されているか確認してください。

### Q. ビルドエラーが発生する

A. `npm install`で依存関係を再インストールしてください。

---

## サポート

問題が発生した場合は、以下を確認してください：

1. [セキュリティガイドライン](.claude/security.md)
2. [開発ルール](.claude/development.md)
3. エラーログの内容
4. 外部サービスのダッシュボード・ログ
