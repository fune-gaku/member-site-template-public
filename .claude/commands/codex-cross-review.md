---
description: GitHub PR に対する Codex × Claude Code のデュアルレビュー収束ループ。両者 LGTM + CI green まで反復し、最後にユーザー承認でマージ
argument-hint: <PR URL or number>
---

`$ARGUMENTS` で指定された PR に対し、**Codex（OpenAI）× Claude Code の二人レビュー収束ループ** を実行する。Codex の指摘 → Claude が full context で評価 + 公式 docs 照合 → 結果を **3 段の構造化コメント** で PR に残す → 双方合意で停止 → CI green → ユーザー承認でマージ。

これは [security.md「セキュリティレビュー手順（必須）」](../security.md#セキュリティレビュー手順必須) の Step 1〜3 を 1 つの自動収束ループに統合した実装です。

---

## このスキルの責務（変更しない監査項目）

Codex に依頼するレビュー観点は以下を **すべて含める**。これらは [security.md](../security.md) と [database.md](../database.md) のチェックリストに連動した「セキュリティ監査の真実の源」であり、フロー改修でスコープを狭めない:

- 正しさ・エッジケース
- セキュリティ（XSS / SSRF / Open Redirect / CSRF / IDOR / SQLi / prompt injection / RLS バイパス / Mass Assignment）
- アクセシビリティ（キーボード / ARIA / WCAG AA）
- i18n（多言語辞書のロックステップ違反）
- テスト網羅（happy path + 境界値）
- リポ全体の一貫性

---

## 入力の解釈

`$ARGUMENTS` は以下のいずれか:

- フル URL: `https://github.com/<owner>/<repo>/pull/<N>` → `<owner>/<repo>` と `<N>` を抽出
- 番号のみ（例 `42`）→ `gh repo view --json nameWithOwner` で `<owner>/<repo>` を補完して `<N>` と組み合わせる

PR 番号が取れなかった場合はその場で停止し、ユーザーに PR 情報を要求する。

---

## 前提条件チェック（実行前に 1 回）

順に確認し、欠けていれば**ユーザーに案内して停止**:

1. **Codex CLI**: `command -v codex` で確認。無ければ:
   ```
   npm i -g @openai/codex   # または brew install --cask codex
   codex login              # ChatGPT Pro/Plus でサインイン
   ```
2. **gh CLI**: `command -v gh` ＋ `gh auth status`。`gh` は Claude が proxy 投稿に使う。Codex sandbox は `gh` を呼ばない設計（本ループでは Codex に GitHub 書き込み capability を持たせない = least privilege）
3. **PR が OPEN かつ非 draft**: `gh pr view <N> --json state,isDraft,headRefName,baseRefName,mergeable,statusCheckRollup`
4. **クリーンな working tree**: `git status --short` が空。コミットされていない変更があれば停止

---

## セットアップ（ループ前に 1 回）

```bash
gh pr checkout <N>
BASE_BRANCH=$(gh pr view <N> --json baseRefName --jq .baseRefName)   # 通常 main
LAST_KNOWN_MAIN=$(git rev-parse origin/$BASE_BRANCH)
mkdir -p .codex-review/<N>
```

各イテレーションの artifacts は `.codex-review/<N>/iter-<k>-*` に保存。ワークスペース直下なので VSCode の markdown リンク（後述「ユーザーへの報告」）から 1 クリックで開ける（`.gitignore` で除外済み）:

| ファイル | 用途 | 投稿可否 |
|--|--|--|
| `iter-<k>.log` | codex CLI の生 stdout（CLI ノイズ・tool trace 含む） | 投稿しない（audit 用 / fallback 用） |
| `iter-<k>-review.md` | Codex が書く review 本文 | **コメント 1 として投稿** |
| `iter-<k>-evaluation.md` | Claude が書く評価テーブル（findings 有り時のみ） | **コメント 2 として投稿** |
| `iter-<k>-docs-check.md` | 公式 docs 照合レポート（C-2 トリガ成立時のみ） | **コメント 3 として投稿** |

---

## 収束ループ（最大 5 反復）

各イテレーションは A → G の 7 段階で進む。投稿条件は上の artifacts 表の通り（B = 常時、E = findings 有り時のみ、F = C-2 トリガ成立時のみ）。

### A. Codex にレビューを依頼（ファイル受け渡し方式）

Codex は review 本文を **ファイルに書き** + **stdout には verdict 行のみ** 出す。Claude が後で proxy 投稿する。`workspace-write` sandbox はファイル書き込みを許可するため動作する。

```bash
set -o pipefail   # codex 失敗が tee の status に隠されないように
LOG=.codex-review/<N>/iter-<k>.log
REVIEW=.codex-review/<N>/iter-<k>-review.md

codex exec --sandbox workspace-write \
  "あなたは PR #<N> （https://github.com/<owner>/<repo>/pull/<N>）をレビューします。

   diff は \`git diff origin/<base>...HEAD\` で読み取ってください
   （\`gh pr diff\` / \`gh pr view\` は sandbox の network 制限で失敗します）。

   レビュー本文は **以下のファイルに書いてください**:
     $REVIEW
   stdout には review 本文を echo せず、最後に **verdict 行 1 件だけ**
   出力してください:
     - 指摘なし → 'CODEX VERDICT: LGTM'
     - 指摘あり → 'CODEX VERDICT: CHANGES REQUESTED'
   review ファイルの末尾にも同じ verdict 行を含めてください
   （PR コメントとして単独で完結するため）。

   重点観点（必須・スコープを狭めない）:
   - 正しさ・エッジケース
   - セキュリティ（XSS / SSRF / Open Redirect / CSRF / IDOR / SQLi /
     prompt injection / RLS バイパス / Mass Assignment）
   - アクセシビリティ（キーボード / ARIA / WCAG AA）
   - i18n（多言語辞書のロックステップ違反）
   - テスト網羅（happy path + 境界値）
   - リポ全体の一貫性

   このリポは Astro 6 SSR + Vue 3 + Supabase + Cloudflare Workers の
   会員サイトテンプレ。.claude/security.md / .claude/development.md /
   .claude/database.md のチェックリストに照らして判定してください。

   修正は絶対にしないこと。レビュー本文のファイル書き出しと verdict のみ。" \
  2>&1 | tee "$LOG"
```

`codex exec` がエラーで落ちた場合は記録してループを止め、ユーザーに手動再実行を依頼。

review ファイルが書かれなかった場合の fallback（protocol 違反として記録、LOG 全体を投稿に回して可視化）。**生 LOG には Codex CLI の tool trace（`workdir: $HOME/...` 等）が含まれ得るので、公開 PR コメントに乗る前に `$HOME` を `~` に redact する**。`sed` だと `$HOME` が regex として解釈されメタ文字（`.` `[` `*` 等）を含むパスで置換漏れが起きるため、Perl の `\Q...\E` で literal escape する:

```bash
if [ ! -s "$REVIEW" ]; then
  echo "[warn] Codex did not write $REVIEW, falling back to sanitized LOG" >&2
  perl -pe 's/\Q$ENV{HOME}\E/~/g' "$LOG" > "$REVIEW"
fi
VERDICT=$(grep -m1 -E '^CODEX VERDICT:' "$REVIEW" || grep -m1 -E '^CODEX VERDICT:' "$LOG")
```

### B. コメント 1 投稿: Codex review（代理投稿）

```bash
gh pr comment <N> --body-file "$REVIEW"
echo "$VERDICT"
```

### C. Claude による評価（あなた自身の責務）

これは受動的な apply ではない。Codex の各指摘について:

1. **必要性** — 本当のバグか、スタイル好みか、false positive か。同等パターンを実コードで再現／grep で確認してから受け入れる
2. **影響範囲** — 1 箇所の指摘でも、`grep` で同パターンが他に何箇所あるか調べる。1 箇所修正で他 3 箇所が壊れたまま、は最悪
3. **副作用** — 提案修正がコール元 / 既存テスト / 規約を壊さないか
4. **Codex が見落とした点** — diff を新鮮な目で読み直し、**Codex の指摘は出発点であって天井ではない**
5. **公式 docs 照合（library / framework 挙動主張があれば必須）** — 後述の C-2

カテゴリ分け: `MUST-FIX` / `VALID-NIT` / `FALSE-POSITIVE` / `DEFER-TO-FOLLOWUP`

`MUST-FIX` と `VALID-NIT` は **このイテレーションで適用** する。`FALSE-POSITIVE` と `DEFER` は **コメント 2** で論拠を残す（次の Codex iteration が考慮できるように）。

### C-2. 公式 docs 照合（library / framework 挙動が前提の指摘では必須）

Codex の指摘が **「ライブラリ X の挙動 Y」「フレームワーク F の API Z」を前提にした recommendation** を含む場合、accept する前に **必ず公式 docs を一次情報として読んで突き合わせる**。Codex も Claude も学習時点の知識でしかないため、以下のような誤りが混入しうる:

- ライブラリの挙動を勘違いしている（例: `getUser()` で session 失効が即時反映される、と暗に仮定）
- 公式が逆の guidance を出している（例: 公式は "Most apps don't need such strong guarantees" と言っているのに、Codex は強い保証を要求）
- 公式推奨パターンと違う方法を提案している（例: 公式は X.sessions テーブル直接 query を推奨だが Codex は別 API 提案）

**手順** (CLAUDE.md「最新情報・不明な情報の確認ルール」の優先順位に従う):

1. 指摘の中で **挙動主張の核**を抽出（例: 「getUser() を使えば session 失効が即時反映される」）
2. 一次情報を取得:
   - Astro: `mcp__astro-docs__search_astro_docs` skill（環境にあれば最優先）
   - Supabase / Cloudflare Workers / Tailwind / Vue 等: `WebFetch` で公式 docs URL を直接取得
   - 一般ベストプラクティス: `WebSearch`（公式 issue / RFC を含めて検索）
3. **公式の文言を verbatim で引用してメモ**（コミットメッセージ + コメント 3 に残せる形に）
4. 公式と Codex 主張を突き合わせ:
   - 完全一致 → MUST-FIX として受け入れ可
   - 部分一致（改善はあるが完全ではない）→ MUST-FIX で受け入れつつ、docstring / コメントで **保証の限界を正確に明記**。完全パターンは別 Issue で defer
   - 不一致（Codex が誤り）→ FALSE-POSITIVE として論拠（公式引用）と共に拒否
   - 公式が別の推奨パターン → 公式パターンを優先採用（Codex 提案ではなく）。複雑度トレードオフが大きいなら Issue 化して defer
5. 受け入れる場合、**コミットメッセージに公式 docs URL と verbatim 引用** を含める。**さらにコメント 3（後述 F）で PR レベルにも可視化** する

**公式が「ほとんどのアプリには不要」「ベストエフォート」「許容できるトレードオフ」と書いている領域には、code 複雑性を入れない**。テンプレートでは特に、defaults を simple に保ち、必要な人は opt-in or 別 Issue で対応の方針を取る。

**この照合を skip した過去事例**（反面教師）: PR #22 iteration 2 で Codex が「admin 経路で `getClaims()` だと session 失効が遅れるので `getUser()` を使え」と指摘 → 公式照合せず accept → 後で公式は "Most applications rarely need such strong guarantees. Consider adjusting the JWT expiry time" と書いていることが判明し、commit を revert する手戻りが発生（commit 4f5e9ea）。**最初に C-2 を回していれば防げた**。

### D. ローカル変更適用 → checks → main 同期 → commit + push

`MUST-FIX` と `VALID-NIT` を実コードに適用したら、push 前に必ずローカルチェックを通す:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

いずれか fail なら **修正してから再実行**。**赤を push しない**（共有 state を壊す）。`npm run build` は時間がかかるので skip し CI に委譲（Cloudflare 関連の build は `wrangler types` 等含めて重い）。

main 同期（push 前に毎回）:

```bash
git fetch origin $BASE_BRANCH
NEW_MAIN=$(git rev-parse origin/$BASE_BRANCH)
if [ "$NEW_MAIN" != "$LAST_KNOWN_MAIN" ]; then
  git merge origin/$BASE_BRANCH --no-edit
  # コンフリクトがこのイテレーションで触ったファイルにある場合:
  #   自分の編集を優先しつつ main 側のロジックを再適用
  # 純粋に構造的なコンフリクト（両側で import 追加など）は自動解消
  # セマンティックに不明瞭なコンフリクトはユーザーに pause して質問
  LAST_KNOWN_MAIN=$NEW_MAIN
  npm run lint && npm run format:check && npm run typecheck && npm run test
fi
```

コミット + push:

- `git add` は **意図的に触ったファイルのみ**。`git add -A` / `git add .` は禁止
- コミットメッセージ: `fix: address codex review (iteration-<k>)` の本文で、受け入れた指摘を順に列挙
- **C-2 で受け入れた指摘は、公式 docs URL + verbatim 引用をコミット本文に含める**（後続 reviewer が同じ照合をやり直さなくて済むように）
- 末尾に必ず `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 通常 push（`--force` 禁止）

push 完了後に commit SHA を控えておく（コメント 2 / 3 で参照する）。

### E. コメント 2 投稿: Claude の評価テーブル（findings 有り時のみ）

Codex が LGTM を返し、かつ あなたの自発検出も無い iteration では **skip**。findings がある場合は `iter-<k>-evaluation.md` を作成して投稿:

```markdown
## Claude's evaluation of iteration <k>

| # | Finding (source) | Category | Action | Reasoning |
|--|--|--|--|--|
| 1 | <Codex 指摘 1 の要約> (Codex) | MUST-FIX | Fixed in <SHA> | <根拠 / grep 結果 / 影響範囲> |
| 2 | <Codex 指摘 2 の要約> (Codex) | VALID-NIT | Fixed in <SHA> | <スタイル改善の根拠> |
| 3 | <Codex 指摘 3 の要約> (Codex) | FALSE-POSITIVE | Rejected | <論拠（既存実装で対処済み / 公式が別 guidance / 等）> |
| 4 | <Codex 指摘 4 の要約> (Codex) | DEFER | Issue #<N> | <スコープ外の理由> |
| 5 | <Claude 独自検出 1> (Claude) | MUST-FIX | Fixed in <SHA> | observed during Claude review, not flagged by Codex; <根拠> |

### Notes
- <iteration 全体の総括 / 次 iteration への申し送り事項があれば>
```

```bash
gh pr comment <N> --body-file .codex-review/<N>/iter-<k>-evaluation.md
```

### F. コメント 3 投稿: 公式 docs 照合レポート（C-2 トリガ成立時のみ）

C-2 を実行した findings がある場合のみ `iter-<k>-docs-check.md` を作成して投稿。トリガ条件は「accept した findings に library / framework 挙動主張が含まれる」。Codex が typo / a11y / テスト不足だけ指摘した iteration では **skip**:

```markdown
## Official docs verification (iteration <k>)

### Finding #<m>: <Codex 主張の要約>

**Codex assertion**: "<原文>"

**Official source**: [<doc title>](<URL>)
> <verbatim 引用>

**Verdict**: <Accepted / Partial accept / Rejected>
**Rationale**: <突き合わせ結果。部分一致なら保証の限界を明記>
**Commit**: <SHA>（公式 URL + 引用を含む）

---

### Finding #<m+1>: ...
（同様）
```

```bash
gh pr comment <N> --body-file .codex-review/<N>/iter-<k>-docs-check.md
```

### G. ループ継続判定

B で取得した verdict マーカーを元に:

- `CODEX VERDICT: LGTM` かつ あなたの評価でも残課題なし → **ループ終了 → CI 待機へ**
- `CODEX VERDICT: LGTM` だが、**あなたが Codex の見落としを発見した** → 修正 push して次イテレーションへ（Codex に再検証させる）
- `CODEX VERDICT: CHANGES REQUESTED` → 次イテレーションへ
- マーカーなし → `CHANGES REQUESTED` 扱い、protocol 違反として記録、Codex に再依頼

**5 反復で強制終了**。両者が収束しない場合は人間判断にエスカレーション。

---

## CI 監視（ループと並行 + ループ終了後の確実待機）

```bash
gh pr checks <N> --json name,state,conclusion,link
```

CI 失敗時:

1. 失敗 job 特定
2. ログ取得: `gh run view <run-id> --log-failed`
3. 可能ならローカル再現、無理ならログを精読
4. 修正 → ローカルチェック → コミット（`fix: CI <job-name> <短い理由>`）→ push
5. push 前は必ず main 同期（D の merge ロジック）

**自分の変更と無関係に見える failure でも無視しない**。pre-existing failure を merge した時点でそれはあなたの責任。明らかにスコープ外（infra / secrets）と判断したらユーザーに escalate。

---

## マージ（両者 LGTM + CI green の両方が成立してから）

ユーザーに **明示確認** を取る:

> Codex LGTM + 私の評価クリア + 全 CI チェック green。マージしてよいですか？

ユーザー承認後:

```bash
gh pr merge <N> --merge   # squash 禁止。プロジェクトは --no-ff merge commit が慣習
```

マージ後: ローカルブランチ削除、merge commit SHA を表示、最終状態を報告。

---

## 安全ルール（常時遵守）

- **ローカルチェックを skip しない。** `--no-verify` / `--no-gpg-sign` / `--force` は禁止
- **Codex の提案を盲信しない。** すべての修正はあなた自身のレビューを通す
- **library / framework 挙動主張を含む Codex 指摘は accept 前に必ず公式 docs を一次情報で照合**（C-2）。skip すると後で revert する手戻りが発生する
- **Codex に異議があれば、コメント 2（評価テーブル）で論拠を示す**（沈黙の disagreement は収束 protocol を壊す）
- **公式が「ほとんどのアプリには不要」と書く領域に code 複雑性を追加しない**。defaults は simple に、強化は opt-in or 別 Issue
- **push 前に必ず main 同期。** stale ブランチは人工的なコンフリクトを生み両 reviewer を混乱させる
- **secret は絶対にコミットしない。** `.env` / `.dev.vars` / credential ファイルを diff に入れない（gitleaks pre-commit で検出されるが事前確認）
- **Codex が見落とした指摘は honestly 帰属表示**。コメント 2 の "(Claude)" 行とコミット本文で「observed during Claude review, not flagged by Codex」と明示
- **CLAUDE.md の規約を尊重**（@import で常時ロード済の `.claude/security.md` / `.claude/development.md` のチェックリスト）

---

## あなた（Claude Code）の "OK" の意味

「Codex が黙った」だけでは不十分。あなた自身の OK には以下が必要:

- `MUST-FIX` 残ゼロ（Codex 指摘 / あなた自身の発見の両方）
- **library / framework 挙動主張を含む受け入れ済 MUST-FIX について、公式 docs で照合し、引用をコミット本文 + コメント 3 の両方に残してある**（C-2）
- 隣接コードに **「diff が誘発するが直してない明らかな関連 issue」が残っていない**（意図的に defer したものはコメント 2 の DEFER 行に理由付きで明示済）
- ローカルチェック全 green
- 変更形状に **テスト追加が伴っている**（新規ロジックには最低 1 つ振る舞いを assert するテスト）
- `.claude/security.md` のチェックリスト（i18n / a11y / セキュリティ規約）に違反していない

これらすべてが揃って初めて CI 待機 → ユーザーに merge go-ahead を求める。

---

## ユーザーへの報告

各イテレーション完了時、チャットに以下を **その場で** 出す。GitHub に切り替えなくてもループ全体（指摘・評価・対応）がチャット内で追える状態を保つ。GitHub への 3 段コメント投稿（B / E / F）は監査記録として今まで通り残すが、ループ中の主 UX はチャット側。

### 出力テンプレート

````markdown
### イテレーション <k> / 5

**Codex verdict**: LGTM / CHANGES REQUESTED (<N> issues)

**今回の対応**:

- <受け入れた指摘 / Claude 自発検出の 1 行サマリ（複数なら箇条書き）>
- commit: <SHA>
- CI: <pending / passing / failing (<job-name>)>

**Claude evaluation** (`iter-<k>-evaluation.md`):

| #   | Finding                | Category       | Action       | Reasoning      |
| --- | ---------------------- | -------------- | ------------ | -------------- |
| 1   | <Codex 指摘 1 の要約>  | MUST-FIX       | Fixed in <SHA> | <根拠>         |
| 2   | <Codex 指摘 2 の要約>  | FALSE-POSITIVE | Rejected     | <論拠>         |

**Artifacts**:

- Codex review 本文: [iter-<k>-review.md](.codex-review/<N>/iter-<k>-review.md)
- Docs check（C-2 トリガ時のみ）: [iter-<k>-docs-check.md](.codex-review/<N>/iter-<k>-docs-check.md)
- 生 LOG（audit 用）: [iter-<k>.log](.codex-review/<N>/iter-<k>.log)

**Posted to GitHub**: review #<id1> [/ evaluation #<id2>] [/ docs-check #<id3>]
````

### ルール

- **Claude evaluation テーブル**は findings 有り時に必ずチャットへ inline 展開する（投稿コメント 2 と同じ内容を verbatim で貼る）。findings ゼロ（Codex LGTM + Claude 自発検出なし）の iteration ではテーブル行を省略し、verdict + CI status だけ出す
- **Codex review 本文**はリンクのみ（数十〜数百行になりやすく、チャットを埋めると逆に追いにくくなる）。ユーザーが詳細を読みたくなったら 1 クリックで開ける形にする
- **C-2 docs-check** が短い（accept した findings が 2-3 件以内）なら、公式 URL + verbatim 引用をチャット末尾に展開する。長くなる場合はリンクのみ
- パスは必ず `.codex-review/<N>/...` のワークスペース相対形式（VSCode native の markdown リンクが効くのは相対パスだけ）。`/tmp/` や `file://` の絶対パスは使わない
- 過去イテレーションの artifacts も同じ `.codex-review/<N>/` 配下にすべて残るので、`iter-1-review.md` `iter-2-review.md` ... を時系列で読み返せる

### 最終マージ完了時

PR 番号、merge commit SHA、累計イテレーション数、特筆すべき disagreement があれば併記。`.codex-review/<N>/` の配置はそのまま残す（後日の audit 用。手動削除はユーザー判断）。

---

## 実行例

- `/codex-cross-review 42` — 同 repo の PR #42 を対象に
- `/codex-cross-review https://github.com/<owner>/<repo>/pull/42` — フル URL 指定
