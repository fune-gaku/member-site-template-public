# セキュリティガイドライン

## 概要

このドキュメントでは、会員サイトテンプレートで実装済みのセキュリティ対策と運用方針を定義します。

### 関連ドキュメント

セキュリティに関連する記述は本リポジトリ内で以下に分散している。役割で使い分ける:

| ドキュメント                                                              | 役割                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本ファイル                                                                | チェックリスト（実装済み / 将来課題） / 新規実装時のセルフチェック / 脅威モデル / コミット前チェックフロー / **セキュリティレビュー手順（必須）** — Claude Code 起動時に常駐 |
| [security-ops.md](./security-ops.md)                                      | 運用ハンドブック（Supabase Dashboard 設定 / セキュリティヘッダ検証 / CSRF 検証 / ファイルアップロード詳細 / セッション寿命方針 / インシデント対応） — 必要時に Read          |
| [database.md](./database.md#新規マイグレーション時のセルフチェックリスト) | RLS / Storage ポリシーの完全 SQL / マイグレーション運用 / 新規マイグレーション時のセルフチェック                                                                             |
| [deployment.md「セキュリティ設定」](./deployment.md#セキュリティ設定)     | Supabase Email Templates / Custom SMTP (Resend) / パスワードポリシー — 本番デプロイ時に必須の Dashboard 側設定                                                               |
| [development.md](./development.md)                                        | TypeScript / Vue / Tailwind の規約 / 命名規則 / エラーハンドリング・バリデーションの実装例                                                                                   |

詳細は本ファイル内では繰り返さず、上記の一次情報を参照する方針。Issue #90 で `security-ops.md` を分離し、`@import` で常駐させるべき項目（実装済みスナップショット・新規実装時セルフチェック・脅威モデル・コミット前フロー・レビュー手順）と、必要時にだけ展開する運用ハンドブックを分けた。

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
- [x] CSRF 対策：状態変更操作は POST のみ、`security.checkOrigin` 有効、`/auth/signout` GET 405 ガード + クロスオリジン POST 403 を自動テストでカバー（`tests/integration/signout-csrf.test.ts` / `tests/workers/csrf.test.ts`、→ [security-ops.md「CSRF 対策（サインアウト経路）」](./security-ops.md#csrf-対策サインアウト経路)）
- [x] OTP / PKCE の適切な分離：メールリンクは `/auth/confirm` のランディング経由でスキャナ GET 耐性を確保（→ [メール経由の認証フロー](./architecture.md#メール経由の認証フローissue-002--002-b)）
- [x] Open Redirect 対策：`next` クエリは `safeNextPath` でサニタイズ（`src/lib/safe-redirect.ts`）
- [x] Supabase メールテンプレートで `{{ .ConfirmationURL }}` は禁止、`{{ .TokenHash }}` + `/auth/confirm` 経由に統一
- [x] Supabase Dashboard のセキュリティ設定を完了（→ [security-ops.md「Supabase Dashboard セキュリティ設定チェックリスト」](./security-ops.md#supabase-dashboard-セキュリティ設定チェックリスト)）
- [x] アカウント列挙対策：`auth.signIn` / `auth.signUp` / `auth.resetPassword` の全失敗ケースを統一応答（成功扱い or `UNAUTHORIZED` + 同一文言）に正規化し、メールアドレスの登録有無を判別不能にする（実装は `src/lib/auth-signin.ts` / `auth-signup.ts` / `auth-reset-password.ts`、テストで bytewise 同一を検証 — Issue #8 / #14）
- [x] ログイン中のパスワード変更時に現在のパスワード再認証を要求：`auth.changePassword` Action は `signInWithPassword` で現パスワードを検証してから `updateUser` を呼ぶ。recovery 用 `auth.updatePassword` とは分離。盗難セッション Cookie 単独 / 共有 PC 攻撃での account takeover を抑止（OWASP Authentication Cheat Sheet / NIST SP 800-63B §5.2.10、実装は `src/lib/auth-change-password.ts` — Issue #19）
- [x] Google OAuth ログイン（PKCE フロー）インフラ：`auth.signInWithGoogle` Action + `/auth/callback` の `exchangeCodeForSession` 経路 + signin/signup の SSR 条件分岐ボタン + `auth.changePassword` UI を email identity 持ちのみに表示する provider 分岐で opt-in 適用可能。**本テンプレートのデフォルトは OFF**（`PUBLIC_GOOGLE_AUTH_ENABLED` 未設定 / `false` で UI 非表示 + Action は `NOT_FOUND` 相当）。identity linking は Supabase デフォルトの **automatic linking** に委ねるが、**前提条件として Email confirmation = ON が必須**（[security-ops.md「Supabase Dashboard セキュリティ設定チェックリスト」](./security-ops.md#supabase-dashboard-セキュリティ設定チェックリスト) の「Email confirmation: ON」を維持）。Supabase Auth は新しい identity が link されるタイミングで **未確認の既存 identity を削除する仕様**（公式: _"will remove any other unconfirmed identities linked to an existing user"_）。これにより攻撃者が被害者の email で先回り signup しても "unconfirmed" 状態で留まり、被害者が Google OAuth で確認済 identity としてログインした時点で攻撃者の identity は purge され、pre-account takeover を防ぐ（[Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)）。要求スコープは Supabase デフォルトの `openid email profile` のみで Drive / Calendar 等は要求しない（最小権限）。`handle_new_user` トリガが OAuth-shaped `raw_user_meta_data` でも壊れず role が default の `member` になることは pgTAP で検証済み（`supabase/tests/database/050-handle-new-user-trigger.test.sql` Test 5+6+7）。セットアップ手順は [.claude/deployment-optional.md「Google OAuth セットアップ（任意）」](./deployment-optional.md#google-oauth-セットアップ任意) — Issue #49 / PR #59 / #63 / #64
- [x] アカウント削除（admin-only）：admin role が他ユーザーを hard delete できる経路を提供（GDPR 第 17 条 / 個人情報保護法 第 35 条 消去請求への defensive 対応）。多層防御として `requireAdmin` で role 検証 + caller.id === userId なら `FORBIDDEN`（自分自身の削除禁止 / `updateUserRole` の self-demotion ガードと同型）+ Storage `avatars/<userId>/` を先に remove（Supabase 公式: "You cannot delete a user if they are the owner of any objects in Supabase Storage"）+ `auth.users` から hard delete + `profiles` / `member_posts` の cascade 削除。cascade は pgTAP `supabase/tests/database/070-cascade-delete-on-user-delete.test.sql` で固定。実装は [src/lib/auth-delete-user.ts](../src/lib/auth-delete-user.ts) — Issue #14。self-service 経路（ユーザー自身による削除）は別 Issue で追加予定
- [x] メールドメイン allowlist（任意 / opt-in）：Supabase Before User Created Hook（Postgres function）として `public.before_user_created_restrict_email_domain(event jsonb)` を提供。`public.auth_allowed_email_domains` テーブルが空の場合は backward-compat で無制限許可（テンプレ既定）、INSERT すると provider-agnostic（email/password / Google OAuth 共通）に signup を制限する。Google Workspace の `hd` claim を email 文字列より優先（暗号学的に正しいドメイン確認）。SECURITY DEFINER + `set search_path = ''` + REST 公開遮断（`revoke execute from public, anon, authenticated`）+ `grant execute to supabase_auth_admin` の多層防御。allowlist テーブルは RLS enable + `revoke all from public, anon, authenticated` で列挙攻撃の入口を遮断（読めるのは Hook 関数経由のみ）。回帰検出は pgTAP `supabase/tests/database/090-before-user-created-domain-allowlist.test.sql` の 25 アサーション（hook ロジック 9 ケース + allowlist テーブルの RLS / privilege 退行検出 10 ケース + provider='google' ガード回帰検出 1 ケース + `deny_all_to_authenticated_and_anon` policy 存在検証 1 ケース）。セットアップ手順は [.claude/deployment-optional.md「メールドメイン allowlist（任意）」](./deployment-optional.md#メールドメイン-allowlist任意) — Issue #11
- [ ] **未実装（将来課題）**: admin role への MFA / TOTP 必須化。Supabase Auth は MFA factor をサポートしているため、admin が増えるタイミングで導入を検討する
- [ ] **未実装（将来課題）**: self-service アカウント削除 (`auth.deleteAccount`)。現パスワード再認証 + OAuth-only ユーザの reauth via Google を含む完全実装は別 Issue で追跡（Issue #14 admin-only スコープから分割）

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
- [x] Workers Logs の PII マスキング：全 server-side `console.error` を `logger.error` 経由（[src/lib/logger.ts](../src/lib/logger.ts)）に集約し、メールアドレス（`u***@example.com` 形式）と JWT（`<redacted-jwt>`）を機械的にマスクしてから Cloudflare Workers Logs に流す。Supabase が返す `{ message }` の message に email が混入するケース（`User user@example.com not found` など）からのリーク経路を断つ。Vue コンポーネント側（ブラウザ console）も同 logger 経由で統一し、画面共有 / サポート対応中の覗き見経路も一律に遮蔽。UUID（user_id 等）は内部識別子として保持（運用診断のため）— Issue #7

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
- [x] セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を全レスポンスに付与（`src/lib/security-headers.ts`、→ [security-ops.md「セキュリティヘッダの動作確認」](./security-ops.md#セキュリティヘッダの動作確認)）
- [x] CORS 設定が適切（Cloudflare Workers が自動管理）
- [x] HTTPS 強制（Cloudflare Workers が自動管理）
- [x] セキュアな Cookie 設定（`@supabase/ssr` が自動管理）
- [x] マイグレーション運用ルールを定義（→ [database.md「新規マイグレーション時のセルフチェックリスト」](./database.md#新規マイグレーション時のセルフチェックリスト)）
- [x] Astro Actions のリクエストボディサイズ上限（一般 100KB / アップロード 6MB）を `src/middleware.ts` で `Content-Length` 検査し、超過時 413 / 欠損時 411 を返す（Issue #9）。`src/lib/request-size-limits.ts` の `UPLOAD_ACTION_PATHS` でアップロード Action を明示列挙
- [ ] **未実装（将来課題）**: Astro Actions のレートリミット（書き込み系: `posts.create` / `auth.signUp` / `admin.inviteUser` 等）。当面は Supabase Auth 側の組込みレートと Cloudflare の DDoS 自動軽減に依存。本格運用時は Cloudflare Rate Limiting Rules で `/_actions/*` を制限する。なおボディサイズ上限は Issue #9 で実装済（CL ガード）
- [ ] **未実装（将来課題）**: Storage `avatars` のユーザー別クォータ。1 ユーザーが履歴蓄積で容量を圧迫する可能性あり。当面は [security-ops.md「運用: 既存オブジェクトの棚卸し」](./security-ops.md#運用-既存オブジェクトの棚卸し) のクエリで手動管理

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
- [ ] 状態変更は GET ではなく POST + `<form action={actions.x.y}>` 経由（[security-ops.md「CSRF 対策（サインアウト経路）」](./security-ops.md#csrf-対策サインアウト経路) と同じ原則）
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

| 脅威                         | リスクレベル              | 対策                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境変数の漏洩               | 高                        | `.gitignore`、コードレビュー                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 権限昇格攻撃                 | 高                        | `profiles` の table-level UPDATE を authenticated から剥奪 + 安全カラムのみ column-level UPDATE を再付与（`20260427002055_*.sql`）。column-level revoke 単独は Supabase default privileges 下で no-op なので table-level revoke が必須。**Issue #42 Phase 1 で `public.user_roles` 別テーブル方式（教科書通り）を追加導入** し `revoke all from authenticated` + `grant select` のみで自己 INSERT/UPDATE/DELETE を一律遮断（pgTAP `080-user-roles-rls.test.sql` で 42501 を固定）。Phase 2 (#43) でアプリ層を user_roles に切替後 `profiles.role` を drop 予定。Phase 1 完了時点では両者を並置                                      |
| XSS攻撃                      | 中                        | Vue自動エスケープ、`v-html`禁止                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SQLインジェクション          | 中                        | Supabaseクライアント使用（パラメータ化クエリ）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 不正ファイルアップロード     | 中                        | 拡張子・MIME・サイズ制限（5MB）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| セッションハイジャック       | 中                        | Secure Cookie、HTTPS、トークン自動リフレッシュ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| CSRF攻撃                     | 低                        | SameSite Cookie（`@supabase/ssr`）+ Astro Actions POST 限定 + `security.checkOrigin`（Origin/Referer 照合）。[security-ops.md「CSRF 対策（サインアウト経路）」](./security-ops.md#csrf-対策サインアウト経路)参照                                                                                                                                                                                                                                                                                                                                                                                                                    |
| RLS バイパス                 | 高                        | RLS を全テーブルで有効化、service_role キーはサーバーのみ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| アカウント列挙               | 中                        | `auth.signIn` / `signUp` / `resetPassword` の全失敗ケースを統一応答に正規化（`auth-signin.ts` / `auth-signup.ts` / `auth-reset-password.ts`）— Issue #8 / #14                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| OAuth pre-account takeover   | 中                        | 攻撃者が未確認の被害者 email で先にローカル signup → 被害者が後から Google OAuth で同 email を初回ログインしたとき identity が攻撃者アカウントに linkage される脅威。本テンプレは **Email confirmation = ON 前提**（Supabase Dashboard） + Supabase Auth が新しい identity を link するときに **未確認の既存 identity を削除する仕様**（公式: _"will remove any other unconfirmed identities linked to an existing user"_）に依拠して防ぐ（[Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)）— Issue #49                                                                                             |
| 招待 URL 経由の第三者 signup | 中（opt-in 機能で軽減可） | 招待制クローズド会員サイト / 特定企業の社員専用サイトで、招待 URL（共有可能なリンク）を共有した瞬間に許可外の第三者が signup できてしまう脅威。Supabase **Before User Created Hook**（`public.before_user_created_restrict_email_domain`）+ `public.auth_allowed_email_domains` allowlist で、provider-agnostic に signup を許可ドメインに限定可能。**opt-in なのでテンプレ既定では無効**（allowlist 空 = 制限なし）。Google Workspace は ID token の `hd` claim を優先参照。セットアップは [.claude/deployment-optional.md「メールドメイン allowlist（任意）」](./deployment-optional.md#メールドメイン-allowlist任意) — Issue #11 |

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

| 層                      | 仕組み                                                                  | タイミング                         | 対象                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ローカル                | [.githooks/pre-commit](../.githooks/pre-commit) + gitleaks              | コミット時                         | staged ファイルの秘密情報                                                                                                                                                                   |
| CI（GitHub Actions）    | [.github/workflows/npm-audit.yml](../.github/workflows/npm-audit.yml)   | PR（package.json 変更）+ 週次月曜  | 依存パッケージの脆弱性（high 以上で fail）                                                                                                                                                  |
| CI（GitHub Actions）    | [.github/workflows/test.yml](../.github/workflows/test.yml)             | 全 PR + main への push             | unit / integration / workers テスト全件（CSRF 405 / 403 ガードを含む）                                                                                                                      |
| CI（GitHub Actions）    | [.github/workflows/quality.yml](../.github/workflows/quality.yml)       | 全 PR + main への push             | `npm run lint`（ESLint）/ `npm run typecheck`（`astro check`）/ `npm run format:check`（Prettier）を 3 ジョブ並列で実行。いずれかが fail すると PR がブロックされる                         |
| CI（GitHub Actions）    | [.github/workflows/db-test.yml](../.github/workflows/db-test.yml)       | `supabase/**` を変更した PR + push | `supabase db lint --fail-on warning`（plpgsql_check：関数の型エラー・dead code 等の構文系を warning 以上で検出）+ `supabase test db`（pgTAP：RLS / トリガー / 列レベル grant の退行を検出） |
| GitHub プラットフォーム | [.github/dependabot.yml](../.github/dependabot.yml) + Dependabot alerts | 週次月曜 09:00 JST                 | npm / GitHub Actions の更新 PR 自動生成                                                                                                                                                     |

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

| 項目                                                                                                                                         | 頻度                                | 確認場所                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Security Advisor / Performance Advisor                                                                                              | 月 1 回、マイグレーション適用直後   | Supabase Dashboard > Database > Advisors                                                                                                                                                    |
| [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com/) でのヘッダ再評価（A 以上維持） | 四半期に 1 回、または本番デプロイ後 | 本番 URL を入力                                                                                                                                                                             |
| CSRF 本番 sanity check（GET 405 / クロスオリジン POST 403 / 同一オリジン POST 200）                                                          | 本番デプロイ後                      | [security-ops.md「CSRF 対策（サインアウト経路）」](./security-ops.md#csrf-対策サインアウト経路) のコマンド参照（回帰検出は自動テスト `npm run test` / `npm run test:workers` でカバー済み） |

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
