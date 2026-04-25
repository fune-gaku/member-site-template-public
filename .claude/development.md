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

`main` は常にデプロイ可能な状態を保ち、変更は **作業単位の feature ブランチ** で行う。

```
main (本番ブランチ、常にデプロイ可能)
  ├── feat/<short-topic>     (新機能)
  ├── fix/<short-topic>      (バグ修正)
  ├── chore/<short-topic>    (運用・依存・ドキュメント)
  └── security/<issue-id>    (セキュリティ Issue 対応)
```

**作業フロー**:

```bash
# 1. 着手時: ブランチ作成
git checkout main
git pull origin main
git checkout -b feat/<short-topic>

# 2. 実装中: こまめにコミット（コミット本文に Why を残す）
git add <files>
git commit -m "feat: ..."

# 3. 完了時: main にマージ（履歴をたどりやすく --no-ff を推奨）
git checkout main
git merge feat/<short-topic> --no-ff
git push origin main

# 4. 不要ブランチを削除
git branch -d feat/<short-topic>
```

**ルール**:

- 作業前に必ずブランチを作成（`main` への直接コミットは禁止）
- 1 ブランチ = 1 関心事（機能 / バグ修正 / 依存更新 を混ぜない）
- マージは `--no-ff` で意図的にマージコミットを残す（後から作業単位で振り返れる）
- ブランチ名は `<type>/<short-topic>` 形式で、`type` は `feat` / `fix` / `refactor` / `chore` / `security` / `docs` から選ぶ

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
