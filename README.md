# Claude Code プロジェクトテンプレート

Claude Codeで効率的に開発を進めるためのプロジェクトテンプレートです。

---

## 📦 テンプレート内容

```
claude-project-template/
├── .claude/
│   ├── CLAUDE.md              # プロジェクト概要（カスタマイズ可能）
│   ├── architecture.md        # アーキテクチャ・技術スタック
│   ├── database.md            # データベース設計
│   ├── security.md            # セキュリティガイドライン（共通）
│   ├── development.md         # コーディング規約
│   ├── deployment.md          # デプロイ手順
│   ├── templates/             # プロンプトテンプレート（共通）
│   │   ├── README.md
│   │   ├── prompt-header.md
│   │   ├── prompt-footer.md
│   │   └── phase-template.md
│   └── phases/
│       └── current.md         # 現在のフェーズ情報
├── init-claude.sh             # 初期化スクリプト
├── .gitignore
└── README.md                  # このファイル
```

---

## 🚀 使い方

### 1. テンプレートからプロジェクト作成

#### 方法A: GitHubテンプレートリポジトリ（推奨）

```bash
# GitHubでこのリポジトリをテンプレートとして設定後
gh repo create my-new-project --template your-github/claude-project-template --public --clone
cd my-new-project
```

#### 方法B: ローカルコピー

```bash
cp -r ~/Documents/GitHub/claude-project-template ~/Documents/GitHub/my-new-project
cd ~/Documents/GitHub/my-new-project
rm -rf .git  # 既存のGit履歴を削除
git init
```

---

### 2. 初期化スクリプト実行

```bash
./init-claude.sh
```

対話形式で以下を入力：
- プロジェクト名
- プロジェクト概要
- 使用者数
- 技術スタック（フロントエンド・バックエンド・デプロイ先）
- DBMS・スキーマ管理方法

---

### 3. プロジェクト固有情報を追加

#### 必須：手動で編集が必要なファイル

1. **`.claude/CLAUDE.md`**
   - 環境変数テーブル（`{{ENV_VARS_TABLE}}`）
   - Phase一覧（`{{PHASES_TABLE}}`）
   - 技術チェックテーブル（`{{TECH_CHECK_TABLE}}`）

2. **`.claude/architecture.md`**
   - ディレクトリ構成（`{{DIRECTORY_STRUCTURE}}`）
   - コンポーネント設計方針
   - 認証フロー・データフロー

3. **`.claude/database.md`**
   - テーブル一覧・定義
   - ビュー・トリガー
   - リレーション図

4. **`.claude/development.md`**
   - 言語・フレームワーク別コーディング規約
   - 命名規則
   - エラーハンドリング例

5. **`.claude/deployment.md`**
   - デプロイ手順
   - 環境変数設定方法
   - トラブルシューティング

---

### 4. Phase 0プロンプト作成

`.claude/templates/phase-template.md`を参考に、Phase 0の実装プロンプトを作成します。

```bash
# テンプレートをコピー
cp .claude/templates/phase-template.md .claude/phases/phase0-prompt.md

# Phase 0固有の内容を記載
# - 実装手順（Step 1-N）
# - 動作確認項目
# - 注意点
```

---

## 📝 カスタマイズガイド

### プレースホルダー一覧

テンプレートには以下のプレースホルダーが含まれています。`init-claude.sh`で自動置換されるものと、手動編集が必要なものがあります。

| プレースホルダー | 自動置換 | 説明 |
|----------------|---------|------|
| `{{PROJECT_NAME}}` | ✅ | プロジェクト名 |
| `{{PROJECT_DESCRIPTION}}` | ✅ | プロジェクト概要 |
| `{{USER_COUNT}}` | ✅ | 使用者数 |
| `{{PROJECT_POLICY}}` | ✅ | 開発方針 |
| `{{FRONTEND_FRAMEWORK}}` | ✅ | フロントエンドフレームワーク |
| `{{DEPLOY_TARGET}}` | ✅ | デプロイ先 |
| `{{DBMS}}` | ✅ | DBMS |
| `{{ENV_VARS_TABLE}}` | ❌ | 環境変数一覧（手動） |
| `{{DIRECTORY_STRUCTURE}}` | ❌ | ディレクトリ構成（手動） |
| `{{TABLES_LIST}}` | ❌ | テーブル一覧（手動） |

### 手動編集のコツ

1. **プレースホルダー検索**
   ```bash
   grep -r "{{" .claude/
   ```

2. **既存プロジェクトから参照**
   - 実際に稼働しているプロジェクトの`.claude/`を参考にする

3. **段階的に埋める**
   - Phase 0開始前に必要最小限を埋める
   - Phase進行に合わせて詳細を追加

---

## 🔄 テンプレート更新

テンプレートリポジトリが更新された場合、共通部分のみを取得できます。

```bash
# security.mdを最新版に更新（プロジェクト固有でないため）
curl -o .claude/security.md https://raw.githubusercontent.com/your-github/claude-project-template/main/.claude/security.md

# templatesディレクトリも更新可能
curl -o .claude/templates/prompt-header.md https://raw.githubusercontent.com/your-github/claude-project-template/main/.claude/templates/prompt-header.md
```

---

## 💡 運用のベストプラクティス

### 1. プロジェクト開始時
- テンプレートから作成
- `init-claude.sh`実行
- プレースホルダーを手動編集
- Phase 0プロンプト作成

### 2. Phase進行中
- `phases/current.md`を常に最新化
- Phase完了時に`phases/phaseN.md`を作成
- 問題発生時はドキュメントに追記

### 3. プロジェクト完了後
- 他のプロジェクトで再利用できる部分をテンプレートにフィードバック
- `security.md`, `development.md`の改善点を反映

---

## 📚 関連リソース

- [Claude Code 公式ドキュメント](https://code.claude.com/docs)
- [セキュリティベストプラクティス](https://owasp.org/www-project-top-ten/)

---

## 🤝 コントリビューション

テンプレートの改善提案は Issue または Pull Request でお願いします。

---

## 📄 ライセンス

MIT License

---

**Happy Coding with Claude! 🚀**
