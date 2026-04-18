# Phase N実装プロンプト テンプレート

このテンプレートを使用して各Phaseの実装プロンプトを作成します。

---

## 使い方

1. このテンプレートをコピー
2. `[N]`をPhase番号に置き換え
3. `[Phase タイトル]`を実装内容に置き換え
4. Phase固有の実装内容を記載
5. `prompt-header.md`と`prompt-footer.md`を前後に追加

---

## テンプレート構成

````markdown
[prompt-header.mdの内容をここに挿入]

---

# Phase [N]: [Phaseタイトル]

あなたは画家作品管理システムのフロントエンド開発を担当するエンジニアです。Phase [N]として[実装内容の概要]を実装してください。

## 🎯 Phase [N]のゴール

- [ゴール1]
- [ゴール2]
- [ゴール3]

---

## 📋 実装手順

### Step 1: [ステップ1のタイトル]

**実装内容**:

- [詳細1]
- [詳細2]

**実装例**:

```[言語]
// コード例
```
````

**注意事項**:

- [注意点1]
- [注意点2]

---

### Step 2: [ステップ2のタイトル]

（同様に記載）

---

## 🔍 Phase [N]固有の動作確認

### 機能テスト

- [ ] [確認項目1]
- [ ] [確認項目2]
- [ ] [確認項目3]

### データベース確認

```sql
-- 確認用SQL
SELECT * FROM [table_name];
```

- [ ] [確認項目1]
- [ ] [確認項目2]

---

## 📝 実装上の注意点

### [技術名]

- [注意点1]
- [注意点2]

### [機能名]

- [注意点1]
- [注意点2]

---

## 🔗 関連ドキュメント

- [CLAUDE.md](../.claude/CLAUDE.md)
- [architecture.md](../.claude/architecture.md) - [関連セクション]
- [database.md](../.claude/database.md) - [関連テーブル]

---

## 🚀 次のPhase

Phase [N+1]: [次Phaseのタイトル]

---

[prompt-footer.mdの内容をここに挿入]

````

---

## 実際の使用例（Phase 0）

```markdown
<!-- prompt-header.mdの内容 -->

---

# Phase 0: プロジェクト基盤構築

あなたは画家作品管理システムのフロントエンド開発を担当するエンジニアです。Phase 0としてプロジェクトの基盤を構築してください。

## 🎯 Phase 0のゴール

- Astro 6 + Vue 3 + Tailwind CSS v4の動作するプロジェクトを構築
- Supabaseクライアント統合
- 認証機能とレイアウトを実装

（以下、Phase固有の内容が続く）

<!-- prompt-footer.mdの内容 -->
````

---

## プロンプト生成スクリプト（将来的に作成可能）

```bash
# プロンプト生成シェルスクリプト例
#!/bin/bash
PHASE=$1
cat .claude/templates/prompt-header.md > .claude/phases/phase${PHASE}-prompt.md
cat .claude/phases/phase${PHASE}-content.md >> .claude/phases/phase${PHASE}-prompt.md
cat .claude/templates/prompt-footer.md >> .claude/phases/phase${PHASE}-prompt.md
```

---

## メンテナンス

- `prompt-header.md`を更新すると、すべてのPhaseプロンプトに反映可能
- `prompt-footer.md`を更新すると、共通のフッター部分を一括変更可能
- Phase固有の内容のみを管理すればよい

---

**このテンプレートを使用して、Phase 0〜6のプロンプトを作成してください。**
