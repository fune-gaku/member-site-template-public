# プロンプト共通ヘッダー

---

## 📚 必読ドキュメント

実装開始前に以下のドキュメントを必ず確認してください：

1. **[CLAUDE.md](../.claude/CLAUDE.md)** - プロジェクト概要・開発フロー
2. **[development.md](../.claude/development.md)** - コーディング規約・命名規則
3. **[security.md](../.claude/security.md)** - セキュリティガイドライン・チェックリスト
4. **[architecture.md](../.claude/architecture.md)** - アーキテクチャ・技術スタック
5. **[database.md](../.claude/database.md)** - データベーススキーマ

---

## ⚠️ 最新情報確認ルール

最新情報の検証ルール・ツール優先順位・公式 URL は **[CLAUDE.md の「最新情報・不明な情報の確認ルール」](../../CLAUDE.md#最新情報不明な情報の確認ルール)** に一元化されています。CLAUDE.md は Claude Code 起動時に自動読み込みされるため、Phase 開始時にあらためて確認してください。

---

## 🎯 プロジェクト概要

**システム名**: 画家作品管理システム
**使用者**: 画家本人とMichioの2名のみ
**方針**: シンプルで使いやすいUIを優先

**技術スタック**:

- Astro 6（SSR）
- Vue 3（Composition API + `<script setup>`）
- Tailwind CSS v4
- Supabase（DB・Auth・Storage）
- Cloudflare Pages/Workers

---

## 📋 開発ルール（重要）

### TypeScript

- 厳格モード使用
- すべての関数・変数に型を明示
- `any`型禁止（`unknown`を使用）

### Vue

- `<script setup lang="ts">`必須
- Composition API使用（Options API禁止）
- Props/Emitsの型定義を明示

### 命名規則

- ファイル: Vueコンポーネントは`PascalCase.vue`、他は`kebab-case`
- 変数・関数: `camelCase`
- 定数: `UPPER_SNAKE_CASE`
- データベース: `snake_case`

### エラーハンドリング

- すべての非同期処理を`try-catch`でラップ
- エラーログは`console.error`
- ユーザーにはフレンドリーなメッセージ表示

---

## 🔒 セキュリティ方針

**必須事項**:

- 環境変数は`.env`ファイルのみ（ハードコード禁止）
- XSS対策: Vue自動エスケープ、`v-html`禁止
- ファイルアップロード: 拡張子・MIME・サイズ制限（30MB）
- バリデーション: フロント・バック両方で実施

**コミット前チェック**:

- `.env`がコミット対象に含まれていないか確認
- [security.md](../.claude/security.md)のチェックリスト確認

---

## 🌿 ブランチ運用（重要）

**Phase開始前に必ずブランチを作成してください：**

```bash
# Phase Nのブランチを作成
git checkout -b phase-N

# 例: Phase 1の場合
git checkout -b phase-1
```

**ブランチ運用のメリット**:

- ✅ `main`ブランチを常にデプロイ可能な状態に保つ
- ✅ 問題発生時に簡単にロールバック可能
- ✅ Phase単位での作業履歴が明確
- ✅ Pull Requestでレビュー可能

**Phase完了後にmainにマージ：**

```bash
# 実装・コミット完了後
git checkout main
git merge phase-N
git branch -d phase-N  # ブランチ削除（オプション）
git push origin main
```

**注意**: Phase 0は既に`main`ブランチで完了していますが、Phase 1以降はブランチ運用を徹底してください。

---
