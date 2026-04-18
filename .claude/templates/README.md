# プロンプトテンプレート

Phase実装プロンプト作成用のテンプレートファイルです。

---

## ファイル構成

| ファイル | 用途 |
|---------|------|
| `prompt-header.md` | プロンプト共通ヘッダー（CLAUDE.md参照、最新情報確認ルールなど） |
| `prompt-footer.md` | プロンプト共通フッター（セキュリティチェック、動作確認、コミット手順） |
| `phase-template.md` | Phase実装プロンプトのテンプレート |

---

## 使い方

### 1. Phase実装プロンプトの作成

```markdown
<!-- 1. prompt-header.mdの内容をコピー -->

<!-- 2. Phase固有の内容を記載 -->
# Phase N: [タイトル]

## 実装手順
...

<!-- 3. prompt-footer.mdの内容をコピー -->
```

### 2. 実際の例（Phase 0）

```bash
# Phase 0プロンプトの構成
├── prompt-header.md        # 共通ヘッダー
├── Phase 0固有の内容       # Step 1〜N、動作確認項目など
└── prompt-footer.md        # 共通フッター
```

---

## メリット

### プロンプトの一貫性
- すべてのPhaseで同じフォーマット
- 重要事項（セキュリティ、最新情報確認）の記載漏れ防止

### メンテナンス性
- 共通部分を一括更新可能
- Phase固有の内容のみを管理

### 肥大化防止
- 共通部分をテンプレート化
- 各Phaseプロンプトは固有部分のみ

---

## テンプレート更新時の注意

### prompt-header.md更新時
- すべてのPhaseに影響
- CLAUDE.md、development.mdとの整合性を確認

### prompt-footer.md更新時
- セキュリティチェックリスト、コミット手順など
- security.mdとの整合性を確認

---

## 次のステップ

1. `phase-template.md`を参考にPhase 0のプロンプトを作成
2. Phase 1〜6のプロンプトも同様に作成
3. 各Phaseプロンプトは`.claude/phases/phase0-prompt.md`のように保存

---

## 将来的な改善案

### プロンプト生成スクリプト

```bash
#!/bin/bash
# generate-prompt.sh
PHASE=$1

cat .claude/templates/prompt-header.md > .claude/phases/phase${PHASE}-prompt.md
cat .claude/phases/phase${PHASE}-content.md >> .claude/phases/phase${PHASE}-prompt.md
cat .claude/templates/prompt-footer.md >> .claude/phases/phase${PHASE}-prompt.md

echo "Phase ${PHASE}プロンプトを生成しました"
```

使い方:
```bash
./generate-prompt.sh 0
# → .claude/phases/phase0-prompt.md が生成される
```

---

**テンプレートを活用して、効率的にプロンプトを作成してください。**
