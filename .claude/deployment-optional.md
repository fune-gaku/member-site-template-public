# 任意機能（opt-in）セットアップ

[deployment.md](./deployment.md) は **本テンプレートを本番デプロイするとき必ずやるべき手順** に絞ってある。本ファイルは「使うときだけ追加で必要になる」opt-in 機能のセットアップを集約する。

該当機能を使わない場合は本ファイルを読む必要はない。`cp .env.example .env && npm install && npm run dev` から本番デプロイまでは [deployment.md](./deployment.md) のみで完結する。

## 収録機能

- [Cloudflare Turnstile（任意 / bot 対策）](#cloudflare-turnstile任意--bot-対策) — `auth.signUp` / `auth.signIn` / `auth.resetPassword` の 3 経路に CAPTCHA を入れる
- [Google OAuth セットアップ（任意）](#google-oauth-セットアップ任意) — email + password に加えて Google ログインを追加

将来追加される opt-in 機能（別 IdP / SSO / 外部サービス連携など）も本ファイルに集約する方針。

---

## Cloudflare Turnstile（任意 / bot 対策）

`auth.signUp` / `auth.signIn` / `auth.resetPassword` の 3 経路に CAPTCHA を入れる opt-in 機能。**検証は Supabase Auth (GoTrue) の公式機能** が直接行う設計（Issue #52 で `src/lib/turnstile.ts` の自前 siteverify を廃止し、`captchaToken` を `supabase-js` の `options.captchaToken` に流すだけの薄い経路に統一した）。

> **本テンプレートのデフォルトは OFF**（[supabase/config.toml](../supabase/config.toml) の `[auth.captcha].enabled = false`、本番 Supabase Dashboard も OFF 想定）。bot 対策が必要なプロジェクトで以下の 3 層をすべて ON に揃えて opt-in する。

クライアント widget は [src/components/TurnstileWidget.vue](../src/components/TurnstileWidget.vue) が Cloudflare CDN script で描画し、token を 3 フォーム共通で Action に submit する仕組みは残置されているため、**3 層を ON にするだけで再有効化できる**。

> ⚠️ **既存プロジェクトを default OFF へ移行するときの注意**: 本番 (Supabase hosted Auth) の runtime 設定は **Dashboard が真実の source of truth** であり、`supabase/config.toml` は **ローカル CLI 開発専用**。すでに本番で Dashboard の Bot and Abuse Protection を ON にしている場合、本テンプレートを default OFF に切り替えても、**マージ単体では本番 Auth の captcha enforcement は OFF にならない**。本番でも OFF にしたい場合は下記 [Turnstile を後から無効化する](#turnstile-を後から無効化する) の順序で Dashboard を OFF にする操作を別途実施すること（クライアント側の `PUBLIC_TURNSTILE_SITE_KEY` を先に消すと本番ログインが全滅するので順序厳守）。

### 1. Cloudflare Dashboard で Turnstile サイトを発行

1. **Cloudflare Dashboard > Turnstile > Add Site**
2. **Site name**: 任意（例: `member-site-template`）
3. **Domain**: 本番ドメイン（例: `member-site-template.fune-gaku.workers.dev`）。複数登録可
4. **Widget mode**: **Managed**（推奨。難易度を Cloudflare が自動判定）
5. 発行された **Site Key**（公開）と **Secret Key**（秘密）を控える

> `.env.example` には Cloudflare 公式の常時 pass テストキーが既定で入っているため、**ローカル開発はこの手順をスキップしても動く**。本番ドメインで実 bot 対策を有効化する時のみ実キーを発行する。

### 2. Supabase Dashboard で Turnstile を有効化（本番）

Supabase Auth が secret を直接持つため、本番では **Cloudflare Workers の secret 登録は不要**。Supabase Dashboard 側で 1 回設定すれば済む。

1. **Supabase Dashboard > Authentication > Settings > Bot and Abuse Protection**
2. **Enable CAPTCHA protection** を ON
3. **Choose CAPTCHA provider** で **Cloudflare Turnstile** を選択
4. **CAPTCHA secret** に Step 1 で発行した **Secret Key** を貼り付け
5. **Save** で確定

> 公式: [Enable CAPTCHA Protection (Supabase Docs)](https://supabase.com/docs/guides/auth/auth-captcha)

### 3. ローカル開発

`supabase/config.toml` の `[auth.captcha]` を `enabled = true` に切り替えると、`supabase start` 起動時に Auth コンテナへ secret を注入する。`secret = "env(TURNSTILE_SECRET_KEY)"` 構文は Supabase CLI が **プロジェクトルートの `.env`** から値を解決する仕様（[公式: Managing Config](https://supabase.com/docs/guides/local-development/managing-config)：_"This will detect any values stored in an `.env` file at the root of your project directory."_）。

```toml
# supabase/config.toml (デフォルト OFF。enabled を true にして使う)
[auth.captcha]
enabled = true
provider = "turnstile"
secret = "env(TURNSTILE_SECRET_KEY)"
```

ローカル開発で Turnstile 検証を効かせる場合は **プロジェクトルートの `.env`**（`PUBLIC_TURNSTILE_SITE_KEY` 等と同じファイル）に Cloudflare のテストキー（[公式テスト用キー一覧](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)）または実 secret を置く。`.env` は repo root の `.gitignore` で ignore 対象。

```bash
# .env (プロジェクトルート、Vite と Supabase CLI 双方が読み取る)
PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA  # 常時 pass のテスト site key
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA  # 常時 pass のテスト secret
```

`supabase/config.toml` を変更したら `supabase stop && supabase start` で再起動して Auth コンテナに反映する。

> 📝 **補足**: Supabase CLI v2 の `loadNestedEnv` は `supabase/` から repo root まで walk するため `supabase/.env` も解決される。本テンプレでは secret は **プロジェクトルート `.env`** に置く方針（公式 docs 表記 + 既存 `.gitignore` 設定との整合）だが、開発者が誤って `supabase/.env` に置いた場合の事故防止に `supabase/.gitignore` で `.env` も defensive に ignore してある。

### 4. 動作確認

ローカル:

```bash
npm run dev   # 3 層が揃っていれば widget が描画され、Auth が captchaToken を verify する
```

本番デプロイ後:

- [ ] `/auth/signup` を開いて Turnstile widget が表示される（site key を build 時に inline）
- [ ] widget を pass せず submit → 400 系で UI 上「メールアドレスまたはパスワードが正しくありません」相当（実際の Auth 応答は `unexpected_failure` 500 だが [auth-signin.ts](../src/lib/auth-signin.ts) で UNAUTHORIZED に正規化、enumeration 防御として正しい挙動）
- [ ] widget pass 後 → 通常通りサインアップ・サインイン・パスワードリセットができる
- [ ] アカウント列挙対策（Issue #8 / #14）の bytewise 同一応答が **Turnstile 失敗ケースを除いて** 維持されている（`tests/unit/auth-{signin,signup,reset-password}.test.ts` で自動検証）

### Turnstile を後から無効化する

3 層を **同期して** OFF にする（順序：サーバ → クライアントの順で切るとログイン破壊事故が無い）:

1. **本番**: Supabase Dashboard > Authentication > Settings > Bot and Abuse Protection で **Enable CAPTCHA protection** を OFF + Save
2. **ローカル**: `supabase/config.toml` で `[auth.captcha].enabled = false` + `supabase stop && supabase start`
3. **クライアント (任意)**: `PUBLIC_TURNSTILE_SITE_KEY` を `.env` / build 環境から削除すると widget も消える（残しても無害だが UI ノイズ回避で削除推奨）

> ⚠️ **やってはいけない順序**: クライアント (層 3) を先に消してサーバ (層 1) が ON のままにすると、widget が出ないため誰も `captchaToken` を取得できず、**全 sign-in / sign-up / reset-password が UNAUTHORIZED で失敗** する。必ずサーバ側から先に切ること。

---

## Google OAuth セットアップ（任意）

email + password に加えて Google OAuth ログインを追加する opt-in 機能（Issue #49）。会員サイトとしての登録摩擦低減と、パスワード起因リスク（credential stuffing / 弱パス / HIBP）の軽減が目的。

> ⚠️ **本節の有効化は PR 2 / PR 3 マージ後**。Issue #49 は 3 PR 分割で進行中で、PR 1（本節を導入した PR）は **基盤・ドキュメント先行** のみ。`auth.signInWithGoogle` Action / signin / signup ボタン / `auth.changePassword` UI の provider 分岐などのコードは **PR 2（Action + callback）/ PR 3（UI + 既存フロー調整）** で追加される。本節は将来運用のための参照手順として先行整備したもので、PR 1 だけが入った状態で `PUBLIC_GOOGLE_AUTH_ENABLED=true` にしても下記の挙動は再現しない。3 PR 全マージ後に本節を頭から実施してください。

> **本テンプレートのデフォルトは OFF**（`PUBLIC_GOOGLE_AUTH_ENABLED` 未設定 / `false` で UI 非表示 + Action は `NOT_FOUND` 相当）。利用企業ごとに以下の 3 層を揃えて opt-in する。

> **identity linking モード**: Supabase デフォルトの **automatic linking** のまま（[公式 Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)）。Supabase Auth は同じ email を持つ identity を automatic に link するが、リンクのタイミングで **未確認 identity（既存の email/password signup で email confirmation 未完了のもの等）を削除** する仕様（公式 docs 引用: _"when a new identity can be linked to an existing user, Supabase Auth will remove any other unconfirmed identities linked to an existing user"_）。本テンプレは **Email confirmation = ON** が前提のため、攻撃者が被害者の email で先回り signup しても "unconfirmed" 状態で留まり、被害者が後から Google OAuth で確認済 identity としてログインした時点で攻撃者の identity は purge される。`linkIdentity()` を使った「ログイン中ユーザーの後付け連携 UI」は本テンプレのスコープ外。
>
> **要求スコープ**: Supabase デフォルト（`openid email profile`）のみ。Drive / Calendar 等の追加スコープは要求しない（最小権限）。

### 1. Google Cloud Console で OAuth client を作成

1. [Google Cloud Console](https://console.cloud.google.com/) > **APIs & Services > Credentials**
2. **+ Create Credentials > OAuth client ID** を選択。Application type は **Web application**
3. **Name**: 任意（例: `member-site-template`）
4. **Authorized JavaScript origins** を追加:
   - 本番: `https://<your-domain>`（例: `https://member-site-template.fune-gaku.workers.dev` または Custom Domain）
   - ローカル: `http://localhost:4321`（Astro dev サーバー）
5. **Authorized redirect URIs** を追加（**Supabase Auth の callback URL であり、アプリの `/auth/callback` ではない**点に注意）:
   - 本番: `https://<project-ref>.supabase.co/auth/v1/callback`（`<project-ref>` は Supabase Dashboard > Settings > General > Reference ID）
   - ローカル: `http://127.0.0.1:54321/auth/v1/callback`（Supabase CLI 起動時の Auth コンテナ）
   - Custom Domain で Supabase の Auth Hostname を変えている場合は該当ホスト名を使用
6. **Create** で発行された **Client ID** と **Client Secret** を控える

> **Authorized redirect URIs の意図**: Google → Supabase Auth → 自アプリ `/auth/callback` の二段リダイレクトのうち、Google が信頼するのは Supabase Auth の URL。自アプリの `/auth/callback` は Supabase の `redirectTo` で別途指定する（次項の `signInWithOAuth({ options: { redirectTo } })`）ので Google 側に登録不要。

### 2. Supabase Dashboard で Google プロバイダを有効化

1. **Supabase Dashboard > Authentication > Providers > Google**
2. **Enable Sign in with Google** を ON
3. **Client ID (for OAuth)**: Step 1 で発行した Client ID
4. **Client Secret (for OAuth)**: Step 1 で発行した Client Secret
5. **Skip nonce checks**: OFF（Web アプリでは default のまま。iOS native 等で `id_token` 直接受け取りをする場合のみ ON 検討）
6. **Save** で確定

> 公式: [Login with Google (Astro / SSR)](https://supabase.com/docs/guides/auth/social-login/auth-google?framework=astro)

### 3. ローカル開発（任意 / 動作確認をしたい場合）

ローカル Supabase でも Google OAuth を試したい場合は `supabase/config.toml` の `[auth.external.google]` セクションを有効化する（Supabase CLI が Auth コンテナへ Client ID/Secret を注入する）。プロジェクトルート `.env` に:

```bash
# .env (プロジェクトルート、Vite と Supabase CLI 双方が読み取る)
PUBLIC_GOOGLE_AUTH_ENABLED=true
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<client-id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<client-secret>
```

`supabase/config.toml` を編集して `enabled = true` + `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"` 構文で値を引き、`supabase stop && supabase start` で再起動。**ローカル動作確認が不要なら Step 1〜2（本番 Supabase Dashboard 側のみ）+ `PUBLIC_GOOGLE_AUTH_ENABLED=true` でビルドすれば足りる**。

> ⚠️ **ローカルで Identity Linking の pre-account takeover 防御を再現したい場合**: 本テンプレのローカル `supabase/config.toml` は `[auth.email] enable_confirmations = false`（開発時の摩擦を減らすデフォルト）。これだと email/password signup が即時 confirmed になり、攻撃者の先回り signup が "unconfirmed" 状態で留まる前提（→ Google 初回ログイン時に purge される）が成立せず、上記「automatic linking + unconfirmed 削除」の保護機構をローカル検証できない。検証したい場合は config.toml の同フラグを一時的に `true` にして `supabase stop && supabase start` で再起動する（本番 Supabase Dashboard は Email confirmation = ON 前提なので production 側はこの問題なし）。

### 4. アプリ側の有効化

ビルド時の `.env`（公開値、build に inline される）に以下を追加:

```bash
# 本番ビルド（.env または .env.production）
PUBLIC_GOOGLE_AUTH_ENABLED=true
```

これで:

- `signin.astro` / `signup.astro` に「Google でサインイン」ボタンが SSR レンダリングされる
- `auth.signInWithGoogle` Action が `signInWithOAuth({ provider: 'google', options: { redirectTo: '<site-url>/auth/callback?next=...' } })` を呼ぶ
- Google → Supabase Auth (`<project-ref>.supabase.co/auth/v1/callback`) → アプリ `/auth/callback?code=...` の順にリダイレクトされ、既存 [callback.astro](../src/pages/auth/callback.astro) の PKCE コード交換で session 確立 → `next` へ遷移

未設定 / `false` のときはボタンが描画されず、Action 側でも `NOT_FOUND` を返す（多層防御）。

### 5. 動作確認

- [ ] `/auth/signin` を開いて「Google でサインイン」ボタンが表示される
- [ ] ボタンをクリックして Google アカウント選択 → 同意 → `/member/dashboard` に到達する
- [ ] 同じ email アドレスで既に email/password アカウントがある場合、Email confirmation 済みであれば自動で identity がリンクされる（[Identity Linking docs](https://supabase.com/docs/guides/auth/auth-identity-linking)）
- [ ] `PUBLIC_GOOGLE_AUTH_ENABLED=false` または未設定でビルドすると、ボタンが非表示で `auth.signInWithGoogle` Action が `NOT_FOUND` を返す
- [ ] 既存の email/password サインイン・サインアップ・パスワードリセットが回帰なく動作する（CSRF / Turnstile / アカウント列挙対策の自動テストすべて green）
- [ ] Mozilla Observatory / securityheaders.com で **A 以上維持**（CSP に Google ロゴ画像等を追加した場合は再評価）

### Google OAuth を後から無効化する

3 層を **同期して** OFF にする（順序：**アプリ → サーバ** の順で切るとログイン破壊事故が無い。Turnstile とは順序が逆。Turnstile はサーバ ON / クライアント OFF だと「token 取れず全 fail」、Google OAuth はサーバ OFF / アプリ ON だと「ボタン押下で `provider is not enabled` 即時失敗」と失敗モードが反対方向のため）:

1. **アプリ**: `PUBLIC_GOOGLE_AUTH_ENABLED=false` または env から削除して再ビルド・再デプロイ → ボタン非表示 + Action `NOT_FOUND`
2. **本番**: Supabase Dashboard > Authentication > Providers > Google で **Enable Sign in with Google** を OFF + Save
3. **Google Cloud Console（任意）**: 不要になった OAuth client を削除、または「Disabled」に変更

> ⚠️ **やってはいけない順序**: Supabase Dashboard を先に OFF にしてアプリ側 `PUBLIC_GOOGLE_AUTH_ENABLED=true` のままにすると、ボタンは表示されるが押下時に `provider is not enabled` エラーで失敗する。必ずアプリ側を先に切ること。
