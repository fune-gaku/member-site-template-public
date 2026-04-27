# セキュリティガイドライン

## 概要

このドキュメントでは、会員サイトテンプレートで実装済みのセキュリティ対策と運用方針を定義します。

### 関連ドキュメント

セキュリティに関連する記述は本リポジトリ内で以下に分散している。役割で使い分ける:

| ドキュメント                                                              | 役割                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 本ファイル                                                                | チェックリスト（実装済み / 将来課題） / 新規実装時のセルフチェック / **セキュリティレビュー手順（必須）** / 運用ハンドブック |
| [database.md](./database.md#新規マイグレーション時のセルフチェックリスト) | RLS / Storage ポリシーの完全 SQL / マイグレーション運用 / 新規マイグレーション時のセルフチェック                             |
| [deployment.md「セキュリティ設定」](./deployment.md#セキュリティ設定)     | Supabase Email Templates / Custom SMTP (Resend) / パスワードポリシー — 本番デプロイ時に必須の Dashboard 側設定               |
| [development.md](./development.md)                                        | TypeScript / Vue / Tailwind の規約 / 命名規則 / エラーハンドリング・バリデーションの実装例                                   |

詳細は本ファイル内では繰り返さず、上記の一次情報を参照する方針。本ファイルの **「コーディング例の重複」「Phase 1 実装の全文 SQL/TS」「マイグレーション運用ルール」「Astro 6 環境変数」** の各セクションは、いずれも上記ドキュメントに集約された（git 履歴で復元可能）。

---

## セキュリティチェックリスト

**このチェックリストの役割**: 本テンプレートが対応しているセキュリティ項目の一覧（実装状況のスナップショット）。新規プロジェクトはこの `[x]` 状態からスタートします。リグレッション（既存 `[x]` 項目を壊していないか）の確認に使ってください。

**コミット前に毎回動的に確認する項目**は [コミット前チェックフロー](#コミット前チェックフロー) 節を参照。**新規テーブル/ポリシー/関数を追加する際のチェック**は [.claude/database.md](./database.md#新規マイグレーション時のセルフチェックリスト) を参照。

### ✅ 認証・認可

- [x] 環境変数（API Key、Secret）がハードコードされていない
- [x] `.env`ファイルが`.gitignore`に含まれている
- [x] `.dev.vars`ファイルが`.gitignore`に含まれている
- [x] `.env.example`には実際の値が含まれていない
- [x] 認証ミドルウェアが全ページに適用されている（`src/middleware.ts`）
- [x] Supabase RLSが適切に設定されている（全テーブル有効化）
- [x] セッショントークン（Cookie）が適切に管理されている（`@supabase/ssr`）
- [x] ログアウト処理でトークンが削除されている
- [x] `/member/*` 配下は認証必須（未認証時リダイレクト）
- [x] `SUPABASE_SERVICE_ROLE_KEY` はサーバーのみで使用
- [x] Admin クライアントは毎リクエスト生成（セッション漏洩防止）
- [x] CSRF 対策：状態変更操作は POST のみ、`security.checkOrigin` 有効、`/auth/signout` GET 405 ガード + クロスオリジン POST 403 を自動テストでカバー（`tests/integration/signout-csrf.test.ts` / `tests/workers/csrf.test.ts`、→ [CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路)）
- [x] OTP / PKCE の適切な分離：メールリンクは `/auth/confirm` のランディング経由でスキャナ GET 耐性を確保（→ [メール経由の認証フロー](./architecture.md#メール経由の認証フロー-issue-002--002-b)）
- [x] Open Redirect 対策：`next` クエリは `safeNextPath` でサニタイズ（`src/lib/safe-redirect.ts`）
- [x] Supabase メールテンプレートで `{{ .ConfirmationURL }}` は禁止、`{{ .TokenHash }}` + `/auth/confirm` 経由に統一
- [x] Supabase Dashboard のセキュリティ設定を完了（→ [Supabase Dashboard セキュリティ設定チェックリスト](#supabase-dashboard-セキュリティ設定チェックリスト)）
- [x] アカウント列挙対策：`auth.signIn` / `auth.signUp` / `auth.resetPassword` の全失敗ケースを統一応答（成功扱い or `UNAUTHORIZED` + 同一文言）に正規化し、メールアドレスの登録有無を判別不能にする（実装は `src/lib/auth-signin.ts` / `auth-signup.ts` / `auth-reset-password.ts`、テストで bytewise 同一を検証 — Issue #8 / #14）
- [x] CAPTCHA (Cloudflare Turnstile) ：`auth.signUp` / `auth.signIn` / `auth.resetPassword` の 3 経路すべてで `TURNSTILE_SECRET_KEY` 設定時に opt-in で有効化。bot による credential stuffing / 自動アカウント作成 / spam reset を抑止（`src/components/TurnstileWidget.vue` を 3 フォーム共通で使用 — Issue #21）。loader script 取得失敗 (ad blocker / CSP / network) は `script.onerror` + 10s timeout で graceful 化し、`@loader-error` emit を通じて各フォームでユーザ向け instruction を表示（Issue #30）
- [x] ログイン中のパスワード変更時に現在のパスワード再認証を要求：`auth.changePassword` Action は `signInWithPassword` で現パスワードを検証してから `updateUser` を呼ぶ。recovery 用 `auth.updatePassword` とは分離。盗難セッション Cookie 単独 / 共有 PC 攻撃での account takeover を抑止（OWASP Authentication Cheat Sheet / NIST SP 800-63B §5.2.10、実装は `src/lib/auth-change-password.ts` — Issue #19）
- [ ] **未実装（将来課題）**: admin role への MFA / TOTP 必須化。Supabase Auth は MFA factor をサポートしているため、admin が増えるタイミングで導入を検討する

### ✅ インジェクション対策

- [x] SQLクエリでユーザー入力を直接連結していない（Supabaseクライアント使用）
- [x] XSS対策：ユーザー入力をエスケープしている（Vue自動エスケープ）
- [x] コマンドインジェクション対策：シェルコマンドにユーザー入力を使用していない
- [x] HTMLインジェクション対策：`v-html`を使用していない

### ✅ データ検証

- [x] フォーム入力のバリデーション（フロントエンド：Vue、バックエンド：Zod）
- [x] ファイルアップロード：拡張子・MIMEタイプ・サイズ制限（5MB）
- [x] 数値入力：型チェック・範囲チェック（Zod）
- [x] 必須項目チェック（Zod）

### ✅ 情報漏洩対策

- [x] エラーメッセージで内部情報を表示していない（ユーザーフレンドリーなメッセージ）
- [x] デバッグログに機密情報を出力していない
- [x] APIレスポンスに不要なデータが含まれていない
- [x] コメントに機密情報が含まれていない

### ✅ アクセス制御

- [x] 他ユーザーのデータにアクセスできない（RLS で制御）
- [x] 管理者のみアクセス可能な機能が保護されている（role チェック）
- [x] ファイルストレージのアクセス制御が適切（Storage RLS）
- [x] APIエンドポイント（Astro Actions）が認証を要求している
- [x] 権限昇格攻撃を防止（`revoke update on profiles from authenticated` で table-level UPDATE を剥奪し、`grant update (display_name, avatar_url, updated_at)` で安全カラムのみ再付与。Supabase の default privileges が table-level UPDATE を grant してくる挙動上、column-level revoke 単独は no-op になる — `20260427002055_fix_profiles_role_privilege_escalation.sql` で修正）
- [x] Mass Assignment 対策：Zod input スキーマで受け付けるフィールドを必要最小限に絞り、`user_id` などサーバー側で確定すべき値はクライアント入力を信頼せず `auth.getUser()` から導出（`posts.create` / `posts.update` / `admin.updateUserRole`）
- [x] IDOR（Insecure Direct Object Reference）対策：ID 参照型の更新／削除 Action（`posts.update` / `posts.delete` 等）は RLS に加え、サーバ側で `.eq("user_id", user.id)` を明示して **多層防御**（[src/actions/index.ts](../src/actions/index.ts) 参照）

### ✅ その他（ネットワーク・ヘッダ・運用）

- [x] 依存パッケージに既知の脆弱性がない（CI の `npm audit --audit-level=high` が PR と週次で自動チェック）
- [x] Dependabot で依存パッケージの更新を週次で自動追跡（[.github/dependabot.yml](../.github/dependabot.yml)）
- [x] gitleaks の pre-commit hook で秘密情報のコミットを自動ブロック（[.githooks/pre-commit](../.githooks/pre-commit)）
- [x] セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を全レスポンスに付与（`src/lib/security-headers.ts`、→ [セキュリティヘッダの動作確認](#セキュリティヘッダの動作確認)）
- [x] CORS 設定が適切（Cloudflare Workers が自動管理）
- [x] HTTPS 強制（Cloudflare Workers が自動管理）
- [x] セキュアな Cookie 設定（`@supabase/ssr` が自動管理）
- [x] マイグレーション運用ルールを定義（→ [database.md「新規マイグレーション時のセルフチェックリスト」](./database.md#新規マイグレーション時のセルフチェックリスト)）
- [x] Astro Actions のリクエストボディサイズ上限（一般 100KB / アップロード 6MB）を `src/middleware.ts` で `Content-Length` 検査し、超過時 413 / 欠損時 411 を返す（Issue #9）。`src/lib/request-size-limits.ts` の `UPLOAD_ACTION_PATHS` でアップロード Action を明示列挙
- [ ] **未実装（将来課題）**: Astro Actions のレートリミット（書き込み系: `posts.create` / `auth.signUp` / `admin.inviteUser` 等）。当面は Supabase Auth 側の組込みレートと Cloudflare の DDoS 自動軽減に依存。本格運用時は Cloudflare Rate Limiting Rules で `/_actions/*` を制限する。なおボディサイズ上限は Issue #9 で実装済（CL ガード）
- [ ] **未実装（将来課題）**: Storage `avatars` のユーザー別クォータ。1 ユーザーが履歴蓄積で容量を圧迫する可能性あり。当面は [運用: 既存オブジェクトの棚卸し](#運用-既存オブジェクトの棚卸し) のクエリで手動管理

---

## 新規実装時のセルフチェックリスト

[database.md「新規マイグレーション時のセルフチェックリスト」](./database.md#新規マイグレーション時のセルフチェックリスト) と並ぶ、**コードを足すときに確認する観点**。「実装済みスナップショット」とは目的が違うので独立節にしている。

### 新規 Astro Action を追加するとき

- [ ] `defineAction` の `input` に Zod スキーマを指定し、**サーバーが受け付けるフィールドだけを並べる**（Mass Assignment 防止）
- [ ] `user_id` などサーバー側で確定すべき値はクライアント入力から取らず、`supabase.auth.getUser()` の `user.id` から導出する
- [ ] 認証必須なら handler 冒頭で `auth.getUser()` を呼び、未認証なら `ActionError({ code: "UNAUTHORIZED" })` を投げる
- [ ] admin 専用なら `requireAdmin(context)` を使う（`role === "admin"` の検証 + 認証統合）
- [ ] ID 参照型の更新／削除は **RLS に加えて `.eq("user_id", user.id)` を明示** して多層防御（IDOR / horizontal privilege escalation）
- [ ] 自分自身に対する破壊的操作は handler 側でも明示的に拒否（例: `admin.updateUserRole` の self-demotion 禁止）
- [ ] エラー時は内部詳細を返さず、ユーザー向けの簡潔な日本語メッセージを `ActionError.message` に詰める。詳細は `console.error("<context>:", error)` で残す
- [ ] 入力の各フィールドに合理的な上限を Zod の `.max()` で設ける（DoS 抑止 / 多層防御）
- [ ] ファイルアップロードを伴う Action なら、`src/lib/request-size-limits.ts` の `UPLOAD_ACTION_PATHS` にパス（例: `/_actions/storage.uploadAvatar`）を追加する。追加しないと一般 Action の 100KB 上限が当たって multipart リクエストが 413 になる（Issue #9）
- [ ] テスト: 認証失敗 / バリデーション失敗 / 認可失敗 / 正常系の少なくとも 4 ケースを `tests/unit/actions-schema.test.ts` などに追加
- [ ] 高頻度な書き込み系（投稿作成・招待送信等）は将来 Cloudflare Rate Limiting で制限する想定。重要な Action は GitHub Issue として記録しておく

### 新規ページ・ルートを追加するとき

- [ ] 認証要否を `src/middleware.ts` のパス判定に反映（`/member/*` / `/admin/*` 配下なら自動で適用される）
- [ ] 状態変更は GET ではなく POST + `<form action={actions.x.y}>` 経由（[CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路) と同じ原則）
- [ ] ハイドレーションが必要な Vue コンポーネントだけ `client:load` を付ける（最小限の JS 配信）
- [ ] 新規の外部リソース（フォント / 画像ホスト / 外部 API）を読み込むなら、CSP に該当ホストを追加（`src/lib/security-headers.ts`）して DevTools で違反が出ないかを必ず確認
- [ ] 認証情報を含む応答が CDN にキャッシュされないことを確認（`/_actions/*` や `/member/*` `/admin/*` で `Cache-Control: private, no-store` 相当の挙動になっているか）
- [ ] `next` 等のリダイレクト先パラメータを受ける場合は必ず `safeNextPath` でサニタイズ（Open Redirect / CWE-601）
- [ ] テスト: SSR 出力の最低限の検証を `tests/integration/pages.test.ts` に追加

### 新規 npm 依存を追加するとき

- [ ] **runtime か dev か** を意識し、runtime は最小化（バンドルサイズ・サプライチェーンリスクを縮める）
- [ ] パッケージの GitHub / npm ページを開き、メンテナンス頻度・直近のセキュリティ Advisory・スター数で健全性を確認
- [ ] postinstall / preinstall script を持つか `npm view <pkg> scripts` で確認（あれば挙動を読む）
- [ ] `npm audit --audit-level=high` でヒットしないこと
- [ ] 追加後に `npm ls <pkg>` で意図しない複数バージョン共存が起きていないか確認（必要なら `package.json` の `overrides` で固定）
- [ ] 追加コミットは `chore(deps): ...` で単独に作る（複数依存の追加・複数依存の更新を 1 コミットに混ぜない）

---

## 脅威モデル

### 想定する脅威

| 脅威                            | リスクレベル | 対策                                                                                                                                                                                                                                   |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境変数の漏洩                  | 高           | `.gitignore`、コードレビュー                                                                                                                                                                                                           |
| 権限昇格攻撃                    | 高           | `profiles` の table-level UPDATE を authenticated から剥奪 + 安全カラムのみ column-level UPDATE を再付与（`20260427002055_*.sql`）。column-level revoke 単独は Supabase default privileges 下で no-op なので table-level revoke が必須 |
| XSS攻撃                         | 中           | Vue自動エスケープ、`v-html`禁止                                                                                                                                                                                                        |
| SQLインジェクション             | 中           | Supabaseクライアント使用（パラメータ化クエリ）                                                                                                                                                                                         |
| 不正ファイルアップロード        | 中           | 拡張子・MIME・サイズ制限（5MB）                                                                                                                                                                                                        |
| セッションハイジャック          | 中           | Secure Cookie、HTTPS、トークン自動リフレッシュ                                                                                                                                                                                         |
| CSRF攻撃                        | 低           | SameSite Cookie（`@supabase/ssr`）+ Astro Actions POST 限定 + `security.checkOrigin`（Origin/Referer 照合）。[CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路)参照                                                           |
| RLS バイパス                    | 高           | RLS を全テーブルで有効化、service_role キーはサーバーのみ                                                                                                                                                                              |
| アカウント列挙                  | 中           | `auth.signIn` / `signUp` / `resetPassword` の全失敗ケースを統一応答に正規化（`auth-signin.ts` / `auth-signup.ts` / `auth-reset-password.ts`）— Issue #8 / #14                                                                          |
| Credential stuffing             | 中           | `auth.signIn` に Cloudflare Turnstile を opt-in 適用（`TURNSTILE_SECRET_KEY` 設定時のみ有効化）— Issue #21                                                                                                                             |
| 自動アカウント作成 / Spam reset | 中           | `auth.signUp` / `auth.resetPassword` にも Turnstile を opt-in 適用 — Issue #21                                                                                                                                                         |

---

## コミット前チェックフロー

```
1. コード実装完了
   ↓
2. セキュリティチェックリスト確認
   ↓
3. npm audit 実行
   ↓
4. .env / .dev.vars がコミット対象に含まれていないか確認
   ↓
5. git diff で機密情報がないか確認
   ↓
6. コミット（.githooks/pre-commit で gitleaks が自動実行される）
```

### 自動化されているチェック

| 層                      | 仕組み                                                                  | タイミング                        | 対象                                                                   |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| ローカル                | [.githooks/pre-commit](../.githooks/pre-commit) + gitleaks              | コミット時                        | staged ファイルの秘密情報                                              |
| CI（GitHub Actions）    | [.github/workflows/npm-audit.yml](../.github/workflows/npm-audit.yml)   | PR（package.json 変更）+ 週次月曜 | 依存パッケージの脆弱性（high 以上で fail）                             |
| CI（GitHub Actions）    | [.github/workflows/test.yml](../.github/workflows/test.yml)             | 全 PR + main への push            | unit / integration / workers テスト全件（CSRF 405 / 403 ガードを含む） |
| CI（GitHub Actions）    | [.github/workflows/db-test.yml](../.github/workflows/db-test.yml)       | `supabase/**` を変更した PR + push | `supabase db lint --fail-on warning`（plpgsql_check：関数の型エラー・dead code 等の構文系を warning 以上で検出）+ `supabase test db`（pgTAP：RLS / トリガー / 列レベル grant の退行を検出） |
| GitHub プラットフォーム | [.github/dependabot.yml](../.github/dependabot.yml) + Dependabot alerts | 週次月曜 09:00 JST                | npm / GitHub Actions の更新 PR 自動生成                                |

**初回セットアップ**:

```bash
brew install gitleaks   # pre-commit hook が機能するために必須
npm install             # prepare スクリプトで core.hooksPath を .githooks に設定
```

**GitHub リポジトリ設定**（一度だけ有効化）:

- Settings > Code security > Dependabot alerts: **ON**
- Settings > Code security > Dependabot security updates: **ON**

Secret scanning / Push protection は Private + Free プランでは使えないため、gitleaks の pre-commit hook で代替している。

### 手動で定期実施する項目

| 項目                                                                                                                                         | 頻度                                | 確認場所                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Security Advisor / Performance Advisor                                                                                              | 月 1 回、マイグレーション適用直後   | Supabase Dashboard > Database > Advisors                                                                                                                |
| [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com/) でのヘッダ再評価（A 以上維持） | 四半期に 1 回、または本番デプロイ後 | 本番 URL を入力                                                                                                                                         |
| CSRF 本番 sanity check（GET 405 / クロスオリジン POST 403 / 同一オリジン POST 200）                                                          | 本番デプロイ後                      | [CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路) のコマンド参照（回帰検出は自動テスト `npm run test` / `npm run test:workers` でカバー済み） |

---

## セキュリティレビュー手順（必須）

**全 PR / 全マージで必須**。pull request を main にマージする前、または PR を介さない直接マージの直前に、レビューを必ず通す。

> 適用範囲は **すべての変更**。例外を作って判断揺れを起こすより一律実施する方が継続しやすい。最小例外は本節末尾参照。

### 推奨経路: `/codex-cross-review` 収束ループ

PR を作っている運用なら、**Codex × Claude Code の二人レビュー収束ループ**を一発で回せる。Codex が指摘 → Claude Code が full context で evaluation/fix → 再 Codex → 双方 LGTM まで反復し、CI green 確認 → ユーザー承認でマージ。

```
/codex-cross-review <PR-number-or-url>
```

詳細は [.claude/commands/codex-cross-review.md](../.claude/commands/codex-cross-review.md)。前提:

- OpenAI Codex CLI: `npm i -g @openai/codex`（または `brew install --cask codex`）→ `codex login`
- ChatGPT Plus / Pro / Business / Edu / Enterprise plan
- gh CLI（既導入）

PR が無い / Codex CLI が無い場合は、以下の **手動 3 段階フロー（fallback）** を実施する。

### 手動 3 段階フロー（fallback）

PR が無い / Codex CLI が無い場合の代替経路。**人間 + 自動ツール 2 種 + Claude Code 1 種の 4 視点** で多層的に検証する。

#### Step 1: `/security-review` skill による自動レビュー

Claude Code 上で内蔵 skill を実行する。pending changes（現在のブランチの差分）に対し、認証・認可・XSS・CSRF・SQLi・情報漏洩などのセキュリティ観点を自動レビューする。

```
/security-review
```

出力結果（findings）を Step 3 の入力としてそのまま保管する。

#### Step 2: OpenAI Codex によるセキュリティチェック

OpenAI Codex（CLI / Web UI、運用環境で利用可能な経路）で以下のテンプレートを使ってレビューを依頼する。

```markdown
以下の git diff に対するセキュリティレビューをお願いします。
このプロジェクトは Astro 6 SSR + Vue 3 + Supabase + Cloudflare Workers
で構成された会員サイトテンプレートです。

【観点】

- 認証・認可（IDOR / 権限昇格 / セッション管理）
- RLS バイパス（Supabase Postgres）
- インジェクション（XSS / SQLi / コマンド）
- CSRF（Astro Actions の状態変更経路）
- Open Redirect
- 情報漏洩（エラーメッセージ / ログ / レスポンス）
- ファイルアップロード
- 依存関係のサプライチェーン
- セキュリティヘッダ（CSP / HSTS / その他）

【出力フォーマット】
重大度別に Critical / High / Medium / Low に分類してください。
各指摘について:

- 該当ファイル・行
- 何が問題か
- 推奨される修正

差分:
[ここに `git diff main...HEAD` の出力を貼り付け]
```

差分が大きい場合はファイル単位に分割して依頼する。出力結果を Step 3 の入力としてそのまま保管する。

#### Step 3: Claude Code による統合レビュー

Step 1 / Step 2 の出力を Claude Code に渡し、以下のテンプレートで統合レビューを依頼する。

```markdown
ブランチ <branch-name> のセキュリティレビュー結果を統合してください。

## /security-review skill の結果

[ここに Step 1 の出力を貼り付け]

## OpenAI Codex の結果

[ここに Step 2 の出力を貼り付け]

以下の観点で統合し、PR description にそのまま貼れる形で出力してください:

1. **重複の確認** — 両者が同じ箇所を指摘している項目（high confidence）
2. **false positive** — どちらか片方の指摘で、コード精査の結果該当しない
   もの（理由を併記）
3. **優先度判定** — Critical / High / Medium / Low + 修正の容易さ
4. **対応方針** — Fix in this PR / Follow-up Issue / Reject（各々の理由）
5. **総括** — このブランチをマージしてよいか

可能なら、対象ファイル・行を具体的に示してください。
```

### 受け入れ基準

main マージの前提として、PR description（または PR 不経由のときはマージコミット本文）に以下を記録する:

- [ ] Step 1 を実行し、Critical / High が 0、または Step 3 で false positive 判定が記録されている
- [ ] Step 2 を実行し、Critical / High が 0、または Step 3 で false positive 判定が記録されている
- [ ] Step 3 の統合レビュー結果（重複・FP・優先度・対応方針・総括）が貼られている
- [ ] 後続 Issue 化したものは GitHub Issue として登録済み（Issue 番号を記録）

### 最小例外

以下のみ Step 1 / Step 2 をスキップして Step 3（Claude Code レビュー）だけで済ませてよい。スキップ時は PR description にその旨と理由を明記する。

- 単一の typo 修正（コードロジックに影響しないコメント / ドキュメントの誤字のみ）
- フォーマット専用コミット（`npm run format` / `npm run lint:fix` の結果のみで実質ロジック変更なし）

判定が微妙な場合は **常に 3 段階を回す** を選択する。

---

## インシデント対応

### 環境変数が漏洩した場合

1. **即座にSupabaseでAPIキーをローテーション**
   - Supabase Dashboard > Settings > API > Reset Keys
2. **Cloudflare Workers の Secret を更新**
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template`
3. Gitコミット履歴から削除（[git-filter-repo](https://github.com/newren/git-filter-repo) を使用）
4. `.env` / `.dev.vars` が `.gitignore` に含まれているか再確認

### 脆弱性が発見された場合

1. `npm audit` で詳細確認
2. `npm audit fix` で自動修正、不可なら `package.json` の `overrides` で固定するか代替パッケージへ
3. 重大な脆弱性は本番運用への影響範囲を見極め、ブロック対応 / Issue 化を即決する

---

> 以下は **運用ハンドブック**。日常コミット時には不要だが、関連作業（Supabase Dashboard 設定 / デプロイ後の検証 / CSRF テスト / ファイルアップロード機能の追加 等）に着手するときに展開して参照する。

---

## Supabase Dashboard セキュリティ設定チェックリスト

マイグレーション SQL に現れないが、**新規 Supabase プロジェクト構築時に Dashboard で必ず設定する項目**。Supabase 公式 [Going into Prod](https://supabase.com/docs/guides/deployment/going-into-prod) と [Password Security](https://supabase.com/docs/guides/auth/password-security) に基づく。

### Auth 設定（Authentication > Providers > Email / Settings）

| 項目                    | 推奨値                     | 理由                                                              |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| Email confirmation      | **ON**                     | メール到達性を保証、なりすまし登録防止                            |
| OTP 有効期限            | **≤ 3600 秒（1 時間）**    | Supabase 公式推奨上限。超えると Security Advisor が警告           |
| Minimum password length | **8 文字**                 | `src/lib/password-schema.ts` の Zod `passwordSchema` と一致させる |
| Password requirements   | **数字 + 小文字 + 大文字** | アプリ側 Zod と一致させる（Zod で先に弾き、Dashboard で二重防御） |
| Confirm email change    | **ON**                     | メール変更時の乗っ取り防止                                        |
| Secure email change     | **ON**                     | 旧メール側での承認を要求                                          |

### Sessions 設定（Authentication > Sessions）

本テンプレートの方針は [セッション寿命方針（Remember Me 非採用）](#セッション寿命方針remember-me-非採用) 参照。プロジェクトの要件に応じて以下を設定:

| 項目                    | 汎用会員サイト | 管理画面・金融系 |
| ----------------------- | -------------- | ---------------- |
| Time-box user sessions  | 30 日          | 24 時間以内      |
| Inactivity timeout      | 適度な値       | 短め             |
| Single session per user | OFF            | **ON**           |

### 組織・プロジェクト側（Account > Security / Organization）

| 項目                        | 推奨         | 備考                                     |
| --------------------------- | ------------ | ---------------------------------------- |
| Supabase アカウントの MFA   | **有効**     | 乗っ取られるとプロジェクトごと支配される |
| Organization の複数 owner   | **2 名以上** | Bus factor 対策                          |
| GitHub 連携アカウントの 2FA | **有効**     | 同上                                     |

### Pro プラン以上で追加で有効化する項目

無料プランでは使えないが、課金後に必ず有効化するもの:

| 項目                               | プラン                   | 用途                                                                                 |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Leaked password protection（HIBP） | **Pro 以上**             | 流出済みパスワードを拒否。無料プランではアプリ層の `ENABLE_HIBP_CHECK=true` で代替中 |
| Point in Time Recovery (PITR)      | **Pro 以上（アドオン）** | DB 障害時の任意時点復元                                                              |
| Network restrictions               | **Pro 以上**             | DB 接続元 IP 制限                                                                    |

---

## セキュリティヘッダの動作確認

`src/middleware.ts` が全レスポンスに共通セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を付与している。定義は `src/lib/security-headers.ts` 参照。

### ローカル環境での確認

```bash
# Astro 開発サーバーを起動
npm run dev

# 別ターミナルで付与されているか確認
curl -sI http://localhost:4321/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

期待される出力例:

```
content-security-policy: default-src 'self'; base-uri 'self'; frame-ancestors 'none'; ...
cross-origin-opener-policy: same-origin
permissions-policy: accelerometer=(), camera=(), ...
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

### 本番環境（Cloudflare Workers）での確認

```bash
curl -sI https://member-site-template.fune-gaku.workers.dev/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

### スキャナでの評価

- [Mozilla Observatory](https://observatory.mozilla.org/) で **A 以上**
- [securityheaders.com](https://securityheaders.com/) で **A 以上**

### CSP 違反チェック

ブラウザ DevTools の Console を開き、以下を操作しても CSP error が出ないことを確認:

- サインアップ・サインイン・サインアウト
- プロフィール画面でアバター画像を表示（`https://<ref>.supabase.co/...`）
- 任意のページのハイドレーション

---

## CSRF 対策（サインアウト経路）

### 基本方針

サインアウトのように **状態を変更する操作は必ず POST** とする（[RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1) safe methods）。リンクベース CSRF（`<a href="/auth/signout">` を踏ませる／メーラーのプリフェッチ）による **意図しない強制ログアウト** を防ぐため、以下を徹底する：

1. **Astro Action + `<form method="POST" action={actions.auth.signOut}>` のみを経由** して `supabase.auth.signOut()` を呼ぶ。
2. `/auth/signout` ページは互換のため残すが、**GET には `405 Method Not Allowed`** を返す。
3. `astro.config.mjs` の `security.checkOrigin` を **既定値 `true` のまま維持**。これで Astro がクロスオリジン POST を自動的に 403 で拒否する。
4. ナビゲーションヘッダ（`Member.astro` / `Admin.astro`）やダッシュボードの「サインアウト」ボタンは全て form POST（Action 呼び出し）に統一する。`<a href="/auth/signout">` は作らない。

### CSRF 検証（自動テスト + 本番デプロイ後の最終確認）

**回帰検出は自動テストでカバー済み**（Issue #16）。`/auth/signout` や `auth.signOut` Action、`security.checkOrigin` 周辺を改修した場合は以下のコマンドで両系統を回す:

```bash
npm run test           # GET 405 ガード（tests/integration/signout-csrf.test.ts）
npm run test:workers   # クロスオリジン POST 403（tests/workers/csrf.test.ts、実 workerd ランタイム）
```

| #   | 観点                                                  | 自動テスト                                                                          | 本番 curl |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 1   | GET / HEAD / その他 safe method → 405 + `Allow: POST` | [tests/integration/signout-csrf.test.ts](../tests/integration/signout-csrf.test.ts) | 下記 1    |
| 2   | クロスオリジン POST → 403（`security.checkOrigin`）   | [tests/workers/csrf.test.ts](../tests/workers/csrf.test.ts)                         | 下記 2    |
| 3   | 同一オリジン POST → 403 でない（CSRF を通過）         | 同上                                                                                | 下記 3    |

**本番デプロイ直後**は、自動テストが通った前提で、デプロイされた実環境が同じ挙動を示すことだけを最終確認する（Cloudflare 側の CDN / WAF / Rate Limiting で挙動が変わっていないかの sanity check）:

```bash
# 1) 攻撃者視点: クロスオリジン GET（リンク踏ませ・メーラー URL プリフェッチを模擬）
curl -i -X GET https://member-site-template.fune-gaku.workers.dev/auth/signout
# 期待: HTTP/2 405 / Allow: POST （Cookie が付いていても sb-* の delete は起きない）

# 2) 攻撃者視点: クロスオリジン POST（Origin ヘッダが別サイト）
curl -i -X POST \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 403 （Astro security.checkOrigin が Origin/Referer 不一致で拒否）

# 3) 同一オリジン POST（正規フロー、ダッシュボードのボタン相当）
curl -i -X POST \
  -H "Origin: https://member-site-template.fune-gaku.workers.dev" \
  -H "Referer: https://member-site-template.fune-gaku.workers.dev/member/dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --cookie "sb-...=..." \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 200 / Set-Cookie: sb-...=; Max-Age=0 （セッション Cookie 削除）
```

### 受け入れ基準

- [x] GET / HEAD / その他 safe method の `/auth/signout` が **405 Method Not Allowed** + `Allow: POST` を返す（自動: `tests/integration/signout-csrf.test.ts`）
- [x] クロスオリジン POST が **403** で拒否される（自動: `tests/workers/csrf.test.ts`、`security.checkOrigin` の動作）
- [x] 同一オリジン POST は **403 にならない**（CSRF を通過する。自動: `tests/workers/csrf.test.ts`）
- [x] スパムメールの URL スキャナーが GET しても Cookie 削除が走らない（本番デプロイ直後に curl で確認）
- [x] ダッシュボード・ナビゲーションヘッダのサインアウトがクリック 1 回で従来どおり動作する

---

## ファイルアップロードのガイドライン

`avatars` バケットのようなユーザーアップロードは多層防御を徹底する。重要度の高い順:

1. **バケット設定（Supabase Storage）が真の防衛線** — `storage.buckets.allowed_mime_types` と `file_size_limit` を初期マイグレーション (`supabase/migrations/20260420205000_init.sql`) で必ず設定。Supabase 公式: _"Upload restrictions ... are defined at the bucket level"_
2. **サーバ側（Astro Action の Zod）で早期検証** — `.refine()` で MIME / サイズを 400 応答で弾く。`upload()` 呼び出し時は `contentType: input.file.type` を明示し、クライアント送出を盲信しない
3. **クライアント側検証は UX 目的のみ** — `<input accept="...">` と `file.type` は DevTools で迂回可能、単独でセキュリティ対策にしない

### 許可する MIME タイプ

`image/png` / `image/jpeg` / `image/webp` / `image/gif` のみ。**`image/svg+xml` は意図的に除外** — SVG は XML + JavaScript 実行コンテナのため、署名付き URL で開かれると `<ref>.supabase.co` 上で Stored XSS が成立し得る（[MDN: SVG restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/SVG_as_an_Image#restrictions)）。SVG が必要な場合は `Content-Disposition: attachment` 固定の別バケットを検討する。

### ファイルサイズ

上限 **5 MB**。`src/lib/avatar-upload.ts` の `MAX_AVATAR_SIZE` を真実の源として、バケット設定・Action・UI で共有する。

### ファイル名サニタイゼーション

`src/lib/avatar-upload.ts` の `sanitizeAvatarFileName()` を使う:

- 日本語・絵文字・多言語 Unicode は保持（UX）
- `/` `\` `:` `*` `?` `"` `<` `>` `|` と制御文字のみ `_` に置換（OS 互換 / パストラバーサル）
- `..` は `_` に畳み込む（パストラバーサル対策）
- 先頭末尾の空白・ドットはトリム（Windows の trailing-dot 解釈事故回避）

### 運用: 既存オブジェクトの棚卸し

バケット制限を後から追加した場合、過去にアップロードされたファイルはそのまま残る。違反オブジェクトを洗い出すクエリ:

```sql
select id, name, owner, metadata->>'mimetype' as mime, metadata->>'size' as size
  from storage.objects
 where bucket_id = 'avatars'
   and (
     (metadata->>'size')::bigint > 5 * 1024 * 1024
     or coalesce(metadata->>'mimetype', '') not in (
       'image/png','image/jpeg','image/webp','image/gif'
     )
   );
```

---

## セッション寿命方針（Remember Me 非採用）

本テンプレートは「ログイン状態を保持」（Remember Me）チェックボックスを採用しない。Supabase Auth はセッション寿命を **per-login で切り替える API を提供しておらず**、すべて **プロジェクト単位の設定**（Dashboard > Auth > Sessions）に一元化される設計のため、UI 上で選択肢を出すと挙動を分岐できず誤解を招く（Issue #009 で削除済）。

寿命の制御軸（プロジェクト設定）:

| 設定項目                | 用途                                                       |
| ----------------------- | ---------------------------------------------------------- |
| Time-box user sessions  | サインインから固定時間でセッションを強制失効               |
| Inactivity timeout      | 一定時間リフレッシュされなかったセッションを失効           |
| Single session per user | 同一ユーザーは最後にサインインしたセッションのみ有効に保つ |

プロジェクト用途別の推奨値は [Supabase Dashboard セキュリティ設定チェックリスト](#supabase-dashboard-セキュリティ設定チェックリスト) の Sessions 表を参照。詳細・最新の挙動は [Supabase Sessions 公式ドキュメント](https://supabase.com/docs/guides/auth/sessions)。

実装上の注意:

- セッションリフレッシュは `@supabase/ssr` の `createServerClient` と `middleware.ts` の `supabase.auth.getUser()` が自動で行う（[認証フロー](./architecture.md#認証フロー)）
- セッションを明示的に終了させたい場合は **サインアウト**（`supabase.auth.signOut()`）
- Dashboard 設定の変更は **次回リフレッシュ時に評価される**（即時反映ではない）

---

## 参考資料

このドキュメントで省略した詳細は、以下の一次情報を参照する。

### 内部ドキュメント / Skill

- `/security-review` — Claude Code 内蔵スキル（→ [セキュリティレビュー手順（必須）](#セキュリティレビュー手順必須)）
- [database.md](./database.md) — RLS / マイグレーション運用 / Supabase Storage ポリシーの完全 SQL / 新規マイグレーション時のセルフチェック
- [deployment.md「セキュリティ設定」](./deployment.md#セキュリティ設定) — Email Templates / Custom SMTP (Resend) / パスワードポリシー
- [development.md](./development.md) — TypeScript / Vue / コーディング規約・命名規則・エラーハンドリング・バリデーション
- [architecture.md](./architecture.md) — 認証フロー / メール経由認証フロー（B 案）/ パフォーマンス方針 / アクセシビリティ

### 公式ドキュメント

- [Astro Security](https://docs.astro.build/en/guides/security/) — `security.checkOrigin` / Actions / CSP
- [Astro Actions](https://docs.astro.build/en/guides/actions/)
- [Supabase Auth: Server-side](https://supabase.com/docs/guides/auth/server-side) — `@supabase/ssr` の使い方
- [Supabase RLS Deep Dive](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Storage Fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Going into Prod](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)

### OWASP

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

### 参考 RFC / 標準

- [RFC 9110 §9.2.1 Safe Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1)
- [RFC 3986 URI](https://www.rfc-editor.org/rfc/rfc3986)
