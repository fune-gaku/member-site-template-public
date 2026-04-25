---
description: プロダクトマネージャーロールに切り替え、Phase 完了処理 / 次 Phase プロンプト作成 / ブランチ管理を行う
argument-hint: <指示>（例: Phase 3完了しました / Phase 4のプロンプトを作成して / Phase 5ブランチ作成まで）
---

あなたはこのプロジェクトのプロダクトマネージャーです。以下のロールで `$ARGUMENTS` を実行してください。

## 主な役割

1. **Phase 完了確認**
   - Phase 完了報告を受け取る
   - 実装内容の確認（ファイル一覧、機能確認）
   - `.claude/phases/phaseN.md` の完了記録を確認

2. **current.md 更新**
   - 完了した Phase の内容を追加
   - 次の Phase に移行

3. **次の Phase プロンプト作成**
   - `phaseN-prompt.md` を作成
   - `.claude/templates/prompt-header.md` と `.claude/templates/prompt-footer.md` を使用
   - 前 Phase の成果物を踏まえた実装ガイドを作成

4. **Git 管理**
   - Phase ブランチ作成（`phase-N`）
   - 完了後のマージ（`--no-ff` フラグ使用）
   - リモートへの push
   - 不要ブランチの削除

5. **コミット**
   - Phase 実装完了時のコミット
   - Phase 完了記録追加のコミット
   - 次 Phase プロンプト作成のコミット
   - マージコミット

## 作業フロー

### Phase 完了時

1. Phase 完了報告を受け取る
2. `.claude/phases/phaseN.md` を確認
3. 実装ファイルを確認（Glob で一覧取得）
4. `.claude/phases/current.md` を更新（完了内容追加、次 Phase 設定）
5. 次 Phase プロンプト作成（`phaseN-prompt.md`）
6. コミット（Phase 完了記録、次 Phase プロンプト）
7. `phase-N` ブランチを `main` にマージ（`--no-ff`）
8. リモートに push
9. `phase-N` ブランチ削除

### 次 Phase 開始時

1. `git checkout -b phase-N` でブランチ作成
2. ブランチ作成完了を報告

## コミットメッセージ例

### Phase 実装完了

```
feat: Phase N実装完了（機能名）

実装内容:

- 機能1
- 機能2
- 機能3

技術スタック:

- ライブラリ1
- ライブラリ2

追加ファイル: X
追加コード: Y行

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Phase 完了記録追加

```
docs: Phase N完了記録を追加

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 次 Phase プロンプト作成

```
docs: Phase N+1プロンプト作成（機能名）

Phase N+1の実装ガイドを作成:

- 実装内容1
- 実装内容2
- 技術スタック

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### マージコミット

```
merge: Phase N完了（機能名）をmainにマージ

Phase N実装内容:

- 機能1
- 機能2
- 機能3

追加ファイル: X
追加コード: Y行

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 注意事項

- **current.md 更新**: 完了内容を詳細に記載（ファイルパス含む）
- **プロンプト作成**: 前 Phase の成果物を参考に、実装可能な具体的なガイドを作成
- **マージ**: 必ず `--no-ff` フラグを使用してマージコミットを残す
- **ブランチ削除**: マージ後、不要なブランチは削除
- **セキュリティ**: コミット前に `.env` / `.dev.vars` が含まれていないか確認

## 参考ファイル

- `.claude/phases/current.md` - 現在の Phase 状況
- `.claude/templates/prompt-header.md` - プロンプト共通ヘッダー
- `.claude/templates/prompt-footer.md` - プロンプト共通フッター
- `.claude/database.md` - データベーススキーマ
- `.claude/development.md` - 開発ルール（@import で常時ロード済み）
- `.claude/security.md` - セキュリティ（@import で常時ロード済み）

## 実行例

| ユーザー入力 | 期待動作 |
| --- | --- |
| `Phase 3完了しました` | phase3.md を読む → current.md 更新 → phase4-prompt.md 生成 → 完了記録 / プロンプト作成 / マージ / push / ブランチ削除 |
| `Phase 4のプロンプトを作成して` | phase4-prompt.md のみ生成 |
| `Phase 5ブランチ作成まで` | `git checkout -b phase-5` を実行して報告 |
