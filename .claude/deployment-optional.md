# 任意機能（opt-in）セットアップ

[deployment.md](./deployment.md) は **本テンプレートを本番デプロイするとき必ずやるべき手順** に絞ってある。本ファイルは「使うときだけ追加で必要になる」opt-in 機能のセットアップを集約する。

該当機能を使わない場合は本ファイルを読む必要はない。`cp .env.example .env && npm install && npm run dev` から本番デプロイまでは [deployment.md](./deployment.md) のみで完結する。

## 収録機能

- [Google OAuth セットアップ（任意）](#google-oauth-セットアップ任意) — email + password に加えて Google ログインを追加
- [メールドメイン allowlist（任意）](#メールドメイン-allowlist任意) — signup を特定メールドメインに限定（招待制クローズド会員サイト / Google Workspace 限定 用途）
- [Workers Builds（詳細 / GitHub 自動デプロイ）](#workers-builds詳細--github-自動デプロイ) — `git push` / PR で Cloudflare 側のビルド・デプロイを自動化し、PR ごとに preview URL を発行

将来追加される opt-in 機能（別 IdP / SSO / 外部サービス連携など）も本ファイルに集約する方針。

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
   - 本番: `https://<your-domain>`（例: `https://member-site-template.your-subdomain.workers.dev` または Custom Domain）
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

ローカル Supabase でも Google OAuth を試したい場合は `supabase/config.toml` の `[auth.external.google]` セクションを有効化する（Supabase CLI が Auth コンテナへ Client ID/Secret を注入する）。プロジェクトルート `.env` に以下を追加する。**`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` は OAuth Client Secret（秘密値）なので、ユーザー自身がエディタで `.env` に直接書き込む**（Claude Code には貼らない）:

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
- [ ] 既存の email/password サインイン・サインアップ・パスワードリセットが回帰なく動作する（CSRF / アカウント列挙対策の自動テストすべて green）
- [ ] Mozilla Observatory / securityheaders.com で **A 以上維持**（CSP に Google ロゴ画像等を追加した場合は再評価）

### Google OAuth を後から無効化する

3 層を **同期して** OFF にする（順序：**アプリ → サーバ** の順で切るとログイン破壊事故が無い。サーバ OFF / アプリ ON だと「ボタン押下で `provider is not enabled` 即時失敗」になるため）:

1. **アプリ**: `PUBLIC_GOOGLE_AUTH_ENABLED=false` または env から削除して再ビルド・再デプロイ → ボタン非表示 + Action `NOT_FOUND`
2. **本番**: Supabase Dashboard > Authentication > Providers > Google で **Enable Sign in with Google** を OFF + Save
3. **Google Cloud Console（任意）**: 不要になった OAuth client を削除、または「Disabled」に変更

> ⚠️ **やってはいけない順序**: Supabase Dashboard を先に OFF にしてアプリ側 `PUBLIC_GOOGLE_AUTH_ENABLED=true` のままにすると、ボタンは表示されるが押下時に `provider is not enabled` エラーで失敗する。必ずアプリ側を先に切ること。

---

## メールドメイン allowlist（任意）

signup を **特定のメールドメインに限定** する opt-in 機能（Issue #11）。「招待制クローズド会員サイト」「特定企業の社員専用」「Google Workspace ドメイン限定」用途で、招待 URL を共有した瞬間に第三者が紛れ込むのを防ぐ。

実装は **Supabase Before User Created Hook**（Postgres function）で、provider-agnostic に email/password / Google OAuth / 将来追加される他 OAuth provider すべてに同じ allowlist が効く。

> **本テンプレートのデフォルトは制限なし**。`public.auth_allowed_email_domains` テーブルが空のときは Hook が無制限に許可を返す（backward-compat）。テンプレ利用者が許可ドメインを INSERT して、かつ Supabase Dashboard で Hook を有効化したときだけ制限が効く。

### 1. ローカル動作確認（任意）

`supabase/config.toml` の `[auth.hook.before_user_created]` は本テンプレでデフォルト有効になっており、`npm run db:start` するだけで Hook が wire-up される。動作確認は **本番と同じ操作**で行える:

1. ローカル Studio を開く: <http://127.0.0.1:54323> (`npm run db:start` で起動済の場合)
2. **SQL Editor** で許可ドメインを 1 件追加:

   ```sql
   insert into public.auth_allowed_email_domains (domain) values ('example.com');
   ```

3. `/auth/signup` に `user@other.com` で送信 → 「このドメインのアカウントではサインインできません」で reject される
4. allowlist を空に戻すには Studio SQL Editor で:

   ```sql
   truncate public.auth_allowed_email_domains;
   ```

> 本番 Supabase Dashboard とローカル Studio は **同じ UI / 同じ SQL Editor**。後述の本番手順 (Step 3) と完全に同型の操作で動作確認できる。

### 2. 本番セットアップ

`supabase/config.toml` は **本番 Supabase Auth に反映されない**（CLI は本番 Auth 設定を更新しない仕様）。本番で Hook を有効化するには Dashboard で手動登録が必要。

1. **Supabase Dashboard > Authentication > Hooks（Beta）**
2. **Add a new hook** > **Before User Created**
3. **Hook type**: `Postgres`
4. **Schema**: `public`
5. **Function name**: `before_user_created_restrict_email_domain`
6. **Enable hook** を ON にして **Create hook**

### 3. 許可ドメインの追加

**Supabase Dashboard > SQL Editor** で実行:

```sql
-- 追加（複数行）
insert into public.auth_allowed_email_domains (domain, note) values
  ('asahi-tanker.co.jp', '旭タンカー トライアル 2026-11'),
  ('partner-fleet.example', 'パートナー船社');

-- 一覧
select * from public.auth_allowed_email_domains order by created_at;

-- 削除
delete from public.auth_allowed_email_domains where domain = 'partner-fleet.example';
```

`domain` カラムは CHECK 制約で **lowercase 強制** + `^[a-z0-9.-]+\.[a-z]{2,}$` 形式必須。`'EXAMPLE.COM'` のような uppercase は INSERT 時に拒否される。

### 4. 動作確認

- [ ] **許可ドメイン**で signup → 通常通り signup できる（email confirmation メールが届く）
- [ ] **許可外ドメイン**で signup → エラーメッセージ「このドメインのアカウントではサインインできません」で reject される（403）
- [ ] Google OAuth でも同じ allowlist が効く（Workspace `hd` claim 一致なら許可）
- [ ] allowlist を `truncate` で空にすると、任意の email で signup できる状態に戻る（backward-compat）

### 5. allowlist を後から無効化

完全に無効化する場合は **Dashboard > Authentication > Hooks** で hook を Disable する。テーブルにデータが残っていても hook 自体が無効になれば判定が走らない。

部分的に元に戻したいだけなら `truncate public.auth_allowed_email_domains;` で空にすれば、hook は有効のまま「allowlist 空 = 無制限許可」の挙動になる。

---

## Workers Builds（詳細 / GitHub 自動デプロイ）

README Step 6 の本番デプロイで使う Cloudflare 公式の **Workers Builds**（GitHub 連携の自動デプロイ + PR preview）について、README が省略した詳細・代替経路・無効化手順を集約する（Issue #71）。`git push` / PR を起点に Cloudflare 側でビルド・デプロイが走るので、テンプレ利用者が手元で `wrangler deploy` を打たずに済む。

### 何ができるか

- `main` への push → 本番環境に自動デプロイ（`npx wrangler deploy` 相当）
- 非本番ブランチ / PR への push → **preview URL を自動発行**（`npx wrangler versions upload` 相当で、active deployment には promote されない）
- 各開発者の PC に `CLOUDFLARE_API_TOKEN` を配布する必要がない（GitHub App ベースの OAuth 連携）
- 既存 GitHub Actions（[.github/workflows/test.yml](../.github/workflows/test.yml) 等）と共存可能。Workers Builds は **Cloudflare 側のビルド & デプロイ**、GitHub Actions は **GitHub 側のテスト & lint** という棲み分け

> **本テンプレートは README Step 6 で Workers Builds を main 経路として採用済み**（"Import a repository" 経由で GitHub と連携し、`git push` で自動デプロイ）。手動 `npx wrangler deploy`（`npm run deploy` script 経由）も併用可能だが、運用ルールが分散すると事故りやすいので **チームごとにどちらをメイン経路にするか決めて統一する** のを推奨。

### 1. Cloudflare Dashboard で Worker と GitHub リポジトリを連携

**標準経路（README Step 6-1）**: README の手順（**Workers & Pages > Create > Import a repository** から GitHub App をインストールしてリポジトリを選択）に従えばよい。**Worker 名は [wrangler.jsonc](../wrangler.jsonc) の `name` フィールドと一致させる** こと（不一致だとビルド失敗。例: `member-site-template`）。

**代替経路: 既に手動 `wrangler deploy` で Worker を作成済みの場合の後付け連携**:

1. **Cloudflare Dashboard > Workers & Pages > 該当 Worker（例: `member-site-template`）**
2. **Settings > Builds > Connect** をクリック
3. プロバイダ（**GitHub**）を選択し、**Cloudflare Workers and Pages** GitHub App をインストール
4. **Repository access** は **Only select repositories** を選び、本テンプレを fork したリポジトリだけを許可（最小権限）
5. **Branch** は `main` を指定（本番ブランチ）

> 公式: GitHub 連携は **Cloudflare Workers and Pages GitHub App** で行われ、`CLOUDFLARE_API_TOKEN` は **不要**。Repository access は GitHub Apps の設定画面から後で `Only select repositories` に変更できる（[GitHub Integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)）。

### 2. Build 設定（Cloudflare Dashboard）

Worker > Settings > Builds で以下を設定:

| 項目                              | 推奨値                | 備考                                                                                                     |
| --------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Branch**                        | `main`                | ここに設定したブランチが「本番」扱い。それ以外のブランチは preview                                       |
| **Build command**                 | `npm run build`       | テストを deploy gate にしたい場合は `npm test && npm run build` に変える（テスト失敗で deploy が止まる） |
| **Deploy command**                | `npx wrangler deploy` | 本番ブランチ用。Cloudflare のデフォルト                                                                  |
| **Non-production deploy command** | （空のままで OK）     | 空だと Cloudflare デフォルトの `npx wrangler versions upload` が使われ、preview URL のみ発行される       |
| **Root directory**                | （空 / `/`）          | このテンプレはモノレポではないので空でよい                                                               |
| **Node.js version**               | `22` 以上             | [.nvmrc](../.nvmrc) と一致させる                                                                         |

### 3. Build variables（公開値のみ。秘匿値はここに書かない）

Worker > Settings > Builds > **Build variables and secrets** に **ビルド時に Vite が読む公開値** を登録する。

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
PUBLIC_SITE_URL=https://<your-domain>
# 任意機能を有効化している場合のみ
PUBLIC_GOOGLE_AUTH_ENABLED=true
```

> **何が「Build variables」に入るべきか**: `import.meta.env.PUBLIC_*` で参照される値（Vite が `astro build` 時にバンドルへ inline するもの）。本テンプレでは README Step 6-2 で登録するこの 3〜4 個の `PUBLIC_*` がすべて。

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` などの runtime secret を Build variables に書かないこと**。Cloudflare 公式が明示しているとおり、Build variables は **ビルド中のみ** 利用可能で **Workers ランタイムには引き継がれない**（[Configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)）。誤って書いてもビルドは通るが、本番リクエストで `env.SUPABASE_SERVICE_ROLE_KEY` が `undefined` になり、admin 機能が全滅する。

### 4. Runtime secrets（README Step 7 の Dashboard 経路 + CLI 代替）

Workers ランタイムが直接読む秘匿値は **Workers Builds の Build variables とは別系統** の per-Worker Secret として登録する。**標準経路は README Step 7 の Dashboard 操作**（Settings > Variables and Secrets > Add > Secret）で、1 度登録すれば以降の Workers Builds 経由のデプロイでも引き継がれる。

CLI 代替として `wrangler secret put` でも同じ per-Worker Secret に書き込める（CI / 自動化スクリプトから登録したい場合に便利）:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template
```

| 用途                       | 場所                                                                                                                                  | 例                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| ビルド時に inline          | Workers Builds の **Build variables**（Dashboard）                                                                                    | `PUBLIC_SUPABASE_URL` / `PUBLIC_SITE_URL` |
| ランタイム読み取り（秘密） | Dashboard > Settings > **Variables and Secrets > Add > Secret** または `wrangler secret put`（**Bindings > Secrets Store ではない**） | `SUPABASE_SERVICE_ROLE_KEY`               |

> 詳細は README Step 7（Dashboard 経路 + 「Secret が登録したはずなのに undefined になる」トラブルシューティング）を参照。**per-Worker Secret と Secrets Store は別物**で、本テンプレのコードは前者に同期アクセスする設計。

### 5. 既存 GitHub Actions との関係

| 層                        | 仕組み                                                                                                                                            | 役割                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GitHub Actions            | [test.yml](../.github/workflows/test.yml) / [npm-audit.yml](../.github/workflows/npm-audit.yml) / [db-test.yml](../.github/workflows/db-test.yml) | PR / push 時に **GitHub のランナー** で test / lint / audit を回す |
| Cloudflare Workers Builds | Dashboard 設定                                                                                                                                    | PR / push 時に **Cloudflare のビルダー** でビルド & デプロイ       |

両方が並列で走り、両方 green になることが望ましい運用。Workers Builds 側は Cloudflare のインフラに直結しているのでビルド成果物がそのまま preview URL になり、GitHub Actions 側は GitHub 上で test 結果を可視化する。

> **テストを deploy gate にしたい場合**: Workers Builds の Build command を `npm test && npm run build` に変えると、テスト失敗時に deploy が走らない（Cloudflare のビルダー上で `npm test` が再実行される）。GitHub Actions の `test.yml` と二重にテストが走る形になるが、Cloudflare 側も自前で test 結果を見て deploy を止める分、防御層が増える。CI 時間を短縮したい場合は GitHub Actions 側でブランチ保護ルールに `test` を required check として登録し、Workers Builds 側は `npm run build` のみに絞る運用でも良い。

### 6. ビルド時に使える環境変数（参考）

Cloudflare が build 中に自動注入する環境変数（[Configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)）:

| 変数                    | 内容             |
| ----------------------- | ---------------- |
| `CI`                    | `true`           |
| `WORKERS_CI`            | `1`              |
| `WORKERS_CI_BUILD_UUID` | 現在のビルド ID  |
| `WORKERS_CI_COMMIT_SHA` | コミットハッシュ |
| `WORKERS_CI_BRANCH`     | ブランチ名       |

例えば preview ブランチだけで挙動を変えたい場合は `WORKERS_CI_BRANCH !== 'main'` でビルドスクリプトを分岐できる。本テンプレでは現状利用していない。

### 7. 動作確認

- [ ] 適当な branch を切って push → Cloudflare Dashboard > Workers & Pages > 該当 Worker > **Builds** タブにビルド履歴が現れる
- [ ] preview ブランチのビルドが成功すると、ビルド詳細から **preview URL**（`https://<hash>-member-site-template.<subdomain>.workers.dev` 形式）が開ける
- [ ] preview URL でログイン・プロフィール更新等が動く（runtime secret が引き継がれている確認）
- [ ] PR を `main` にマージ → 本番 URL が新しいバージョンに置き換わる
- [ ] [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com/) で本番 URL を再評価し A 以上を維持

### Workers Builds を後から無効化する

1. **Cloudflare Dashboard > Workers & Pages > 該当 Worker > Settings > Builds > Disconnect**（または Repository を Disconnect）
2. 以降は手動 `npm run deploy`（= `wrangler deploy`）に戻る。runtime secret はそのまま残るので追加作業は不要
3. リポジトリ側の権限を完全に剥奪したい場合は GitHub の **Settings > Applications > Cloudflare Workers and Pages** から該当リポジトリの permission を外す or app を uninstall

### 公式ドキュメント

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Builds Configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Git integration setup](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [GitHub Integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
