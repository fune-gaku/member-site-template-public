# 開発ルール・コーディング規約

## コーディング規約

### {{LANGUAGE_1}} (例: TypeScript)

{{LANGUAGE_1_RULES}}

---

### {{FRAMEWORK_1}} (例: Vue 3)

{{FRAMEWORK_1_RULES}}

---

### CSS (Tailwind CSS v4)

{{CSS_RULES}}

---

## 命名規則

### ファイル名

| 種類 | 命名規則 | 例  |
| ---- | -------- | --- |

{{FILE_NAMING_RULES}}

### 変数・関数

| 種類 | 命名規則 | 例  |
| ---- | -------- | --- |

{{VARIABLE_NAMING_RULES}}

### データベース

| 種類 | 命名規則 | 例  |
| ---- | -------- | --- |

{{DATABASE_NAMING_RULES}}

---

## ディレクトリ・ファイル構成ルール

{{DIRECTORY_RULES}}

---

## コメント規約

{{COMMENT_RULES}}

---

## エラーハンドリング

### 原則

{{ERROR_HANDLING_PRINCIPLES}}

### 実装例

```{{LANGUAGE_1}}
{{ERROR_HANDLING_EXAMPLE}}
```

---

## バリデーション

### フロントエンド

```{{LANGUAGE_1}}
{{FRONTEND_VALIDATION}}
```

### バックエンド

{{BACKEND_VALIDATION}}

---

## Git・コミットルール

### ブランチ戦略

**Phase別ブランチ運用**（推奨）：

```
main (本番ブランチ、常にデプロイ可能)
  ├── phase-1 (機能A)
  ├── phase-2 (機能B)
  ├── phase-3 (機能C)
  └── ...
```

**ブランチ作成・マージフロー**:

```bash
# 1. Phase開始時: ブランチ作成
git checkout main
git pull origin main
git checkout -b phase-N

# 2. 実装中: こまめにコミット
git add .
git commit -m "feat: ..."

# 3. Phase完了時: mainにマージ
git checkout main
git merge phase-N --no-ff  # マージコミットを作成

# 4. ブランチ削除（オプション）
git branch -d phase-N

# 5. プッシュ
git push origin main
```

**ルール**:

- **Phase開始前に必ずブランチ作成**
- Phase完了まで`phase-N`ブランチで作業
- `main`への直接コミットは禁止
- マージ時は`--no-ff`でマージコミットを明示的に作成

**個人プロジェクトの場合**:
ブランチ運用を簡略化する場合は、`main`ブランチのみで運用することも可能です。
ただし、Phase単位での作業履歴を明確にするため、ブランチ運用を推奨します。

### コミットメッセージ

**フォーマット**:

```
<type>: <subject>

<body>（オプション）

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**type**:

- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `style`: スタイル変更
- `docs`: ドキュメント
- `chore`: その他

---

## テスト方針

{{TEST_POLICY}}

---

## パフォーマンス

{{PERFORMANCE_GUIDELINES}}

---

## 国際化（i18n）

{{I18N_POLICY}}

---

## アクセシビリティ

{{ACCESSIBILITY_GUIDELINES}}

---

## IDE設定推奨

### VSCode拡張機能

{{VSCODE_EXTENSIONS}}

### settings.json（推奨）

```json
{{VSCODE_SETTINGS}}
```

---

## まとめ

{{DEVELOPMENT_SUMMARY}}
