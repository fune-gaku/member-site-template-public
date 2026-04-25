---
description: open PR を triage して分類レポートを出力。Dependabot は patch/minor/major のリスク分類、機能 PR は /codex-cross-review への誘導。修正・マージは絶対に行わず、必ずユーザー承認を待つ
argument-hint: [time-window]（任意、例: 24h / 7d / 30d。省略時は全 open PR）
---

`$ARGUMENTS` を時間ウィンドウとして（省略時は全 open PR を対象）、現在のリポの open PR を **一括 triage** してください。各 PR を分類し、推奨アクション付きの report を出力した時点で **必ず停止し、ユーザー承認を待つ**。**修正・マージなどの状態変更操作は本 skill では一切行わない**。

このスキルは [isamu/claude の pr-quality-sweep](https://github.com/isamu/claude/blob/main/skills/pr-quality-sweep/SKILL.md) の「triage → 停止 → ユーザー承認」パターンを、本リポ（CodeRabbit / Sourcery 未導入、Dependabot 主体）向けに採用したもの。深掘りレビューは [/codex-cross-review](./codex-cross-review.md) に委譲する。

---

## Step 1: Orient

```bash
gh repo view --json nameWithOwner --jq .nameWithOwner   # owner/repo を取得
date -u +%Y-%m-%dT%H:%M:%SZ                              # 現在時刻（report ヘッダ用）
```

`$ARGUMENTS` が指定されていれば cutoff timestamp を計算（`24h` / `7d` / `30d` 等）。省略時は全 open PR が対象。

## Step 2: open PR を一覧化

```bash
gh pr list --state open --limit 100 \
  --json number,title,author,labels,createdAt,updatedAt,headRefName,baseRefName,isDraft,mergeable
```

cutoff があれば `updatedAt >= CUTOFF` で filter。

## Step 3: 各 PR を分類

各 PR に対して以下を判定:

### 著者で大別

- **`author.login == "app/dependabot"`** → 自動依存更新 PR
- **それ以外** → 人間 PR（機能・修正・セキュリティ）

### Dependabot PR の細分類

PR title から version delta を抽出（`from X.Y.Z to A.B.C` パターン）し、semver で区分:

| 区分                 | 判定例                           | 推奨                                                                    |
| -------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| **patch**            | `1.2.3 → 1.2.4`                  | safe → CI green 確認 → `gh pr merge <N> --merge`                        |
| **minor**            | `1.2.0 → 1.3.0`                  | safe-ish → release notes 一読 → merge                                   |
| **major**            | `1.x → 2.0.0`                    | **HOLD** → 別ブランチで動作確認、breaking 評価必須。**自動 merge 厳禁** |
| **group update**     | `Bump the minor-and-patch group` | 内訳を `gh pr view <N>` で確認 → CI green なら merge                    |
| **gh-actions major** | `actions/checkout 5 → 6`         | 中リスク → release notes + workflow 互換確認 → merge                    |

### 人間 PR の細分類

- branch 名 `security/*` または `security` ラベル → **`/codex-cross-review <N>` を強く推奨**
- branch 名 `feat/*` `fix/*` `refactor/*` → **`/codex-cross-review <N>`**
- branch 名 `chore/*` `docs/*` で変更が `.md` / `.gitignore` / `.github/` のみ → 軽量レビューでも可、ただし収束ループは安全策

## Step 4: CI ステータスを取得

各 PR について:

```bash
gh pr checks <N> --json name,state,conclusion
```

- `success` → ✅ green
- `failure` / `cancelled` → ❌ failing（**merge 禁止**、原因調査が先）
- `pending` / `queued` → ⏳ 待機中（再 check 必要）
- `neutral` / `skipped` → ⚪ 中立

## Step 5: 報告 (triage report) — 出力フォーマット

以下の Markdown 形式で 1 つの report として出力する:

```markdown
# PR Triage Report

- 生成: <ISO timestamp>
- 対象: <window or "全 open">
- 件数: <total>

## ✅ Auto-merge 推奨（Dependabot patch/minor、CI green）

### #<N> <title>

- author: <author>
- 区分: patch / minor / minor-and-patch group
- CI: ✅ green
- 推奨: `gh pr merge <N> --merge`
- 理由: <なぜ safe か / 主要含有パッケージ>

## ⚠️ HOLD（Dependabot major、要レビュー）

### #<N> <title>

- author: <author>
- 区分: major（X.Y.Z → A.B.C）
- CI: <state>
- 推奨: 別ブランチで動作確認 → breaking changes を確認 → 個別判断
- 主要 breaking changes（確認できた範囲）: <bullet list>
- 確認できなかった点: <bullet list>

## 🔍 `/codex-cross-review` 推奨（機能・セキュリティ PR）

### #<N> <title>

- author: <author>
- 区分: feature / security / fix
- CI: <state>
- 推奨: `/codex-cross-review <N>`
- 理由: 人間が書いた変更で full security review が必要

## ❌ 失敗中（merge 不可）

### #<N> <title>

- 失敗 job: <job name>
- ログ確認: `gh run view <run-id> --log-failed`
- 推奨: 失敗を解消してから再 triage

## ⏳ 保留（CI 待機 / draft 等）

### #<N> <title>

- 状態: pending / draft / merge-conflict
- 推奨: 状態が確定するまで待つ
```

## Step 6: STOP（最重要）

**ここで必ず停止する。**

- ❌ `gh pr merge` を実行しない
- ❌ `gh pr review --approve` を実行しない
- ❌ branch checkout や fix push を行わない
- ❌ ユーザーに「次にこの PR を処理しますか？」と能動的に聞かない（report を見たユーザーが個別に指示する設計）

ユーザーが個別 PR について「#<N> をマージして」「#<N> を `/codex-cross-review` で」と指示してから初めて動く。

---

## 安全ルール

- `git add .` / `git add -A` は禁止
- main 直接 push は禁止（必ず feature branch + PR）
- force-push は禁止
- merge は `--merge`（squash 禁止、`--no-ff` のマージコミットを残すのが本リポ慣習）
- [.claude/security.md](../security.md) と [.claude/development.md](../development.md) の規約を **Dependabot や bot の自動判断より常に優先**
- **不確実な判定は HOLD に倒す**（auto-merge 推奨は確信があるときだけ）
- report に **「私が確認できなかった点」を必ず明記**（例: 「この group update 内の X.Y.Z の breaking changes は changelog 未確認」）。silent skip は厳禁
- gh CLI でコメント／レビュー投稿はしない（読み取りのみ）

---

## 実行例

- `/pr-triage` — 全 open PR を triage
- `/pr-triage 24h` — 過去 24 時間に更新された PR のみ
- `/pr-triage 7d` — 過去 1 週間
- `/pr-triage 30d` — 過去 30 日

---

## 補足: 関連 skill との使い分け

| skill                     | 単位         | 動作                                | 使うとき                                   |
| ------------------------- | ------------ | ----------------------------------- | ------------------------------------------ |
| **`/pr-triage`**          | 複数 PR 横断 | 分類 + 報告のみ、停止               | 朝一の「open PR 全体把握」用               |
| **`/codex-cross-review`** | 単一 PR      | 二人レビュー収束ループ + マージ提案 | 個別の機能・セキュリティ PR の本格レビュー |
