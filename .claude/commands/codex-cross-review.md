---
description: GitHub PR に対する Codex × Claude Code のデュアルレビュー収束ループ。両者 LGTM + CI green まで反復し、最後にユーザー承認でマージ
argument-hint: <PR URL or number>
---

`$ARGUMENTS` で指定された PR に対して、**Codex（OpenAI）× Claude Code の二人レビュー収束ループ** を実行してください。Codex が指摘 → あなた（Claude Code）が full context で評価・修正・追加チェック → 再 Codex → 双方合意で停止。CI green を待ってからユーザー承認のもとマージ。

これは [security.md「セキュリティレビュー手順（必須）」](../security.md#セキュリティレビュー手順必須) の **Step 1〜3 を 1 つの自動収束ループに統合した実装** です。

---

## 入力の解釈

`$ARGUMENTS` は以下のいずれか:

- フル URL: `https://github.com/<owner>/<repo>/pull/<N>` → `<owner>/<repo>` と `<N>` を抽出
- 番号のみ（例 `42`）→ `gh repo view --json nameWithOwner` で `<owner>/<repo>` を補完して `<N>` と組み合わせる

PR 番号が取れなかった場合はその場で停止し、ユーザーに PR 情報を要求する。

---

## 前提条件チェック（実行前に 1 回）

以下を順に確認し、欠けていれば**ユーザーに案内して停止**:

1. **Codex CLI**: `command -v codex` で確認。無ければ:
   ```
   npm i -g @openai/codex   # または brew install --cask codex
   codex login              # ChatGPT Pro/Plus でサインイン
   ```
2. **gh CLI**: `command -v gh` ＋ `env -u GH_TOKEN -u GITHUB_TOKEN gh auth status`（このリポは既に gh 利用中なので通常 OK）。`env -u` を付けるのは step 3 と同じ理由で、親 shell に stale な `GH_TOKEN` / `GITHUB_TOKEN` が残っていても keyring 経由で sanity check できるようにするため。これがないと step 3 の修正に到達する前に preflight が落ちて、本来の修正効果が無効化される
3. **gh auth token を export（Codex sandbox 用）**: `GH_TOKEN=$(env -u GH_TOKEN -u GITHUB_TOKEN gh auth token)` で keyring 値を取得して保持。Codex CLI の sandbox は macOS Keychain にアクセスできず、sandbox 内から `gh` を叩くと `The token in default is invalid` で失敗する（Issue #28）。`GH_TOKEN` env が設定されていれば gh は keyring を引かずに env を使うため、これで回避する。**重要**: `gh auth token` 単体では公式仕様 (`gh help environment`) により親 shell の `GH_TOKEN` / `GITHUB_TOKEN` env が stored credentials より優先されるため、親に stale な値が残っていると古い token を Codex に再注入してしまう。`env -u` で env を一旦剥がしてから取得することで keyring の真値を確実に取り出せる
4. **PR が OPEN かつ非 draft**: `gh pr view <N> --json state,isDraft,headRefName,baseRefName,mergeable,statusCheckRollup` で確認
5. **クリーンな working tree**: `git status --short` が空。コミットされていない変更があれば停止
6. 反復ごとの新規コメントを時刻でフィルタするため、**ループ開始時刻** を `date -u +%Y-%m-%dT%H:%M:%SZ` で取得して保持

---

## セットアップ（ループ前に 1 回）

```bash
gh pr checkout <N>
BASE_BRANCH=$(gh pr view <N> --json baseRefName --jq .baseRefName)   # 通常 main
LAST_KNOWN_MAIN=$(git rev-parse origin/$BASE_BRANCH)
```

ループ中の中間 state は `/tmp/codex-cross-review-<N>/iteration-<k>.json` に保存（事後レビュー用）。

---

## 収束ループ（最大 5 反復）

### A. Codex にレビューを依頼

```bash
ITER_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# GH_TOKEN を明示注入（Codex sandbox は macOS Keychain を引けないため）。Issue #28 参照。
# `env -u GH_TOKEN -u GITHUB_TOKEN` で親 shell の env token を一旦剥がしてから取得することで、
# 親に stale な GH_TOKEN が残っていても keyring の真値を確実に渡せる
# (`gh auth token` は公式仕様で env token を stored credentials より優先する)。
GH_TOKEN=$(env -u GH_TOKEN -u GITHUB_TOKEN gh auth token) \
  codex exec --sandbox workspace-write \
  "あなたは PR #<N> （https://github.com/<owner>/<repo>/pull/<N>）をレビューします。

   gh CLI で diff を読み取り、行単位の指摘は
     gh api repos/<owner>/<repo>/pulls/<N>/comments
   全体への指摘は
     gh pr comment <N>
   で投稿してください。

   重点観点:
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

   作業の最後に、必ず単独行で始まる verdict マーカーを 1 件だけ
   トップレベル comment に投稿してください:
     - 指摘なし → 'CODEX VERDICT: LGTM'
     - 指摘あり → 'CODEX VERDICT: CHANGES REQUESTED' に続けて
       未解決事項の bullet サマリ

   修正は絶対にしないこと。レビューと指摘投稿のみ。"
```

`codex exec` がエラーで落ちた場合は記録してループを止め、ユーザーに手動再実行を依頼。

### B. 今回イテレーションで Codex が投稿した内容を取得

```bash
gh api "repos/<owner>/<repo>/pulls/<N>/comments" --paginate \
  --jq "[.[] | select(.user.login | test(\"codex\"; \"i\")) | select(.created_at > \"$ITER_START\")]" \
  > /tmp/codex-cross-review-<N>/inline-<k>.json

gh api "repos/<owner>/<repo>/issues/<N>/comments" --paginate \
  --jq "[.[] | select(.user.login | test(\"codex\"; \"i\")) | select(.created_at > \"$ITER_START\")]" \
  > /tmp/codex-cross-review-<N>/top-<k>.json
```

トップレベルコメントから `CODEX VERDICT:` 行を探す。これが機械可読の停止条件。

### C. 各指摘を **あなたが** 評価

これは受動的な apply ではない。Codex の指摘ごとに:

1. **必要性** — 本当のバグか、スタイル好みか、false positive か。同等パターンを実コードで再現／grep して確認してから受け入れる
2. **影響範囲** — 1 箇所の指摘でも、`grep` で同パターンが他に何箇所あるか調べる。1 箇所修正で他 3 箇所が壊れたまま、は最悪
3. **副作用** — 提案修正がコール元 / 既存テスト / 規約を壊さないか
4. **Codex が見落とした点** — diff を新鮮な目で読み直し、**Codex の指摘は出発点であって天井ではない**
5. **公式 docs 照合 (フレームワーク / ライブラリ挙動主張があるとき必須)** — 後述の C-2 を参照

カテゴリ分け: `MUST-FIX` / `VALID-NIT` / `FALSE-POSITIVE` / `DEFER-TO-FOLLOWUP`

`MUST-FIX` と `VALID-NIT` は**このイテレーションで適用**。`FALSE-POSITIVE` と `DEFER` は **PR にトップレベル返信** で「適用しない理由」を投稿（次の Codex 評価が考慮できるように）。

### C-2. 公式 docs 照合（library / framework 挙動が前提の指摘では必須）

Codex の指摘が **「ライブラリ X の挙動 Y」「フレームワーク F の API Z」を前提にした recommendation** を含む場合、accept する前に **必ず公式 docs を一次情報として読んで突き合わせる**。Codex も Claude も学習時点の知識でしかないため、以下のような誤りが混入しうる:

- ライブラリの挙動を勘違いしている (例: `getUser()` で session 失効が即時反映される、と暗に仮定)
- 公式が逆の guidance を出している (例: 公式は "Most apps don't need such strong guarantees" と言っているのに、Codex は強い保証を要求)
- 公式推奨パターンと違う方法を提案している (例: 公式は X.sessions テーブル直接 query を推奨だが Codex は別 API 提案)

**手順** (CLAUDE.md「最新情報・不明な情報の確認ルール」の優先順位に従う):

1. 指摘の中で **挙動主張の核**を抽出 (例: 「getUser() を使えば session 失効が即時反映される」)
2. 一次情報を取得:
   - Astro: `mcp__astro-docs__search_astro_docs` skill (環境にあれば最優先)
   - Supabase / Cloudflare Workers / Tailwind / Vue 等: `WebFetch` で公式 docs URL を直接取得
   - 一般ベストプラクティス: `WebSearch` (公式 issue / RFC を含めて検索)
3. **公式の文言を verbatim で引用してメモ**。コミットメッセージや PR コメントに残せる形に
4. 公式と Codex 主張を突き合わせ:
   - 完全一致 → MUST-FIX として受け入れ可
   - 部分一致 (改善はあるが完全ではない) → MUST-FIX で受け入れつつ、docstring / コメントで **保証の限界を正確に明記**。受け入れ範囲を超えた完全パターンは別 Issue で追跡
   - 不一致 (Codex が誤り) → FALSE-POSITIVE として PR コメントで論拠 (公式引用) と共に拒否
   - 公式は別の推奨パターン → 公式パターンを優先採用 (Codex 提案ではなく)。複雑度トレードオフが大きいなら Issue 化して defer
5. 受け入れる場合、コミットメッセージに **公式 docs URL と引用** を含める。後続 reviewer が同じ照合をやり直さなくて済むように

**公式が「ほとんどのアプリには不要」「ベストエフォート」「許容できるトレードオフ」と書いている領域には、code 複雑性を入れない**。テンプレートでは特に、defaults を simple に保ち、必要な人は opt-in or 別 Issue で対応の方針を取る。

**この照合を skip した過去事例** (反面教師): PR #22 iteration 2 で Codex が「admin 経路で `getClaims()` だと session 失効が遅れるので `getUser()` を使え」と指摘 → 公式照合せず accept → 後で公式は "Most applications rarely need such strong guarantees. Consider adjusting the JWT expiry time" と書いていることが判明し、commit を revert する手戻りが発生 (commit 4f5e9ea)。**最初に C-2 を回していれば防げた**。

### D. ローカルチェック（コード変更後）

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

いずれか fail なら**修正してから再実行**。**赤を push しない**（共有 state を壊す）。`npm run build` は時間がかかるので skip し CI に委譲（Cloudflare 関連の build は `wrangler types` 等含めて重い）。

### E. main 同期（push 前に毎回）

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

### F. コミット + push

- `git add` は **意図的に触ったファイルのみ**。`git add -A` / `git add .` は禁止
- コミットメッセージ: `fix: address codex review (iteration-<k>)` の本文で、受け入れた指摘を順に列挙
- 末尾に必ず `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
- 通常 push（`--force` 禁止）

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
5. push 前は必ず main 同期（E）

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
- **library / framework 挙動主張を含む Codex 指摘は accept 前に必ず公式 docs を一次情報で照合** (C-2 参照)。これを skip すると後で revert する手戻りが発生する
- **Codex に異議があれば、返信コメントで論拠を示す**（沈黙の disagreement は収束 protocol を壊す）
- **公式が「ほとんどのアプリには不要」と書く領域に code 複雑性を追加しない**。defaults は simple に、強化は opt-in or 別 Issue
- **push 前に必ず main 同期。** stale ブランチは人工的なコンフリクトを生み両 reviewer を混乱させる
- **secret は絶対にコミットしない。** `.env` / `.dev.vars` / credential ファイルを diff に入れない（gitleaks pre-commit で検出されるが事前確認）
- **Codex が見落とした指摘は honestly 帰属表示**。「Codex が指摘した」ように装わない。コミット本文で「observed during Claude review, not flagged by Codex」と明示
- **CLAUDE.md の規約を尊重**（@import で常時ロード済の `.claude/security.md` / `.claude/development.md` のチェックリスト）

---

## あなた（Claude Code）の "OK" の意味

「Codex が黙った」だけでは不十分。あなた自身の OK には以下が必要:

- `MUST-FIX` 残ゼロ（Codex 指摘 / あなた自身の発見の両方）
- **library / framework 挙動主張を含む受け入れ済 MUST-FIX について、公式 docs で照合し引用をコミット本文に残してある** (C-2)
- 隣接コードに **「diff が誘発するが直してない明らかな関連 issue」が残っていない**（意図的に defer したものは PR コメントで理由付きで明示済）
- ローカルチェック全 green
- 変更形状に **テスト追加が伴っている**（新規ロジックには最低 1 つ振る舞いを assert するテスト）
- `.claude/security.md` のチェックリスト（i18n / a11y / セキュリティ規約）に違反していない

これらすべてが揃って初めて CI 待機 → ユーザーに merge go-ahead を求める。

---

## ユーザーへの報告

各イテレーション完了時に 3〜4 行で:

```
イテレーション <k> / 5
Codex verdict: LGTM / CHANGES REQUESTED (<N> issues)
今回の変更: <1 行サマリ>
CI status: <現状>
```

最終マージ完了時: PR 番号、merge commit SHA、累計イテレーション数、特筆すべき disagreement があれば併記。

---

## 実行例

- `/codex-cross-review 42` — 同 repo の PR #42 を対象に
- `/codex-cross-review https://github.com/fune-gaku/member-site-template/pull/42` — フル URL 指定
