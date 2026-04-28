# Astro Vue Supabase Cloudflare Template

会員サイトを最短で立ち上げるためのテンプレート。Astro + Vue + Supabase + Cloudflare Workers で、認証 / プロフィール / 投稿 / 管理画面 / RLS / セキュリティヘッダがすべて初期実装済み。

**人間は GUI 操作と Claude Code へのチャット指示だけ。CLI は Claude Code が代行します。**

| 担当            | 操作                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| **人間**        | Supabase Dashboard / Cloudflare Dashboard / GitHub UI / ブラウザでの動作確認 / Claude Code への指示 |
| **Claude Code** | git / npm / supabase CLI / wrangler CLI / `.env` と `.dev.vars` の作成 / コード変更全般             |

---

## 必要なもの

- **[Claude Code](https://claude.com/claude-code)** — CLI 操作とコード変更を代行する AI エージェント
- **[Supabase](https://supabase.com/dashboard) アカウント** — 無料プランで OK
- **[Cloudflare](https://dash.cloudflare.com/) アカウント** — 無料プランで OK
- **GitHub アカウント**
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** がインストールされた PC — ローカル DB 用、Claude Code が起動する

---

## 30 分でローカルで動かす

GUI 操作（人間）と Claude Code への指示（チャット）を交互に行います。CLI は Claude Code が代行するので、**ターミナルを自分で開く必要はありません**。

### Step 1: GitHub で自分のリポジトリを作る（GUI）

このリポジトリのページ右上、緑色の **"Use this template"** ボタンをクリックし、**"Create a new repository"** を選びます。

- **Repository name**: 任意（例: `my-club`）
- **Public / Private**: どちらでも可（迷ったら Private 推奨）

**"Create repository"** をクリックして数秒待つと、自分のリポジトリができあがります。次の Step に進む前に、リポジトリページ右上の緑色の **"Code"** ボタン → **"HTTPS"** タブで表示される URL（`https://github.com/<your-name>/<repo>.git`）をコピーしておきます。Step 3 で Claude Code に渡します。

### Step 2: Supabase で新規プロジェクトを作る（GUI）

1. <https://supabase.com/dashboard> にログイン
2. 画面右上の緑色の **"New project"** ボタンをクリック
3. 以下を入力して **"Create new project"** をクリック:
   - **Project name**: 任意（例: `my-club`）
   - **Database Password**: ランダムな強いパスワードを生成し、**パスワードマネージャに保存**（後の本番運用で使います）
   - **Region**: 利用者が多い地域に近い場所（日本なら **"Northeast Asia (Tokyo)"**）
4. プロジェクトが **"Setting up project"** 状態になります → 1〜2 分待ちます

完成したら、左サイドバーの **歯車アイコン (Project Settings) → API** を開きます。以下 3 つの値をメモ帳などにコピーしておきます（Step 3 で Claude Code に渡します）:

| 欄の表示名             | 説明                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| **"Project URL"**      | `https://<ref>.supabase.co` 形式                                         |
| **"Publishable key"**  | `eyJ...` または `sb_publishable_...` で始まる長い文字列（公開してよい）  |
| **"Service Role key"** | `eyJ...` で始まる長い文字列（**絶対に他人に見せない / コミットしない**） |

> Service Role key の右にある 👁 アイコンを押すと値が表示されます。コピー後、メモ帳のウィンドウは早めに閉じてください。

### Step 3: Claude Code にローカル開発の準備を依頼（チャット）

PC のお好きな場所（例: `~/Developer/`）でターミナルを開き、`claude` を起動します。最初のメッセージとして以下をコピペで投げます。`<...>` の部分は Step 1・Step 2 でコピーした値に置き換えてください。

```
このリポジトリの初期セットアップをお願いします。

1. <Step 1 でコピーした GitHub の URL> を clone してそのディレクトリに移動
2. 依存関係をインストール（npm install）
3. .env と .dev.vars を以下の値で作成
4. ローカル DB を起動して全マイグレーションを適用
5. 開発サーバを立ち上げ

PUBLIC_SUPABASE_URL=<Step 2 の Project URL>
PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Step 2 の Publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Step 2 の Service Role key>
```

Claude Code は内部で以下を代行します:

- `git clone <URL>` → `cd <repo>`
- `npm install`
- `.env`（公開値）と `.dev.vars`（Service Role key）の作成
- `npm run db:start`（Docker 上のローカル Supabase 起動。初回は image 取得で 1〜3 分）
- `npm run db:reset`（全マイグレーション適用）
- `npm run dev`（開発サーバ起動）

途中で Docker Desktop が起動していないなどのエラーが出たら、Claude Code が指示してくれるのでそれに従ってください。

### Step 4: ブラウザで動作確認（GUI）

開発サーバが起動すると、Claude Code がローカル URL を表示します（通常 <http://localhost:4321>）。ブラウザで開いて以下を確認します:

- トップページの **"サインアップ"** リンクから仮のメール / パスワードで登録
- `/member/dashboard` に到達できれば成功
- `/member/profile` で表示名を編集 → 保存して反映されること
- `/member/posts` で投稿を作成 → 一覧に出ること

ローカル DB は Docker 内で完結しているので、ここで作ったテストアカウントは本番の Supabase には影響しません。サインアップ確認メールはローカルのメールキャッチャー（`http://localhost:54324`、Inbucket）で確認できます。

ローカルで動くことが確認できたら、本番デプロイに進みます。

---

## 本番デプロイ（30 分）

ここからは「ローカルで作ったコードを **本番の Supabase + Cloudflare Workers** に展開する」フェーズです。Cloudflare の **Workers Builds** という GitHub 連携機能を使うと、`git push` ごとに Cloudflare 側が自動でビルド・デプロイしてくれます（手元で `wrangler deploy` を打つ必要なし）。

### Step 5: Supabase 本番セキュリティ設定（GUI）

ローカル開発で使った Supabase プロジェクトをそのまま本番でも使う前提で進めます（別プロジェクトを使いたい場合は Step 2 を本番用にもう一度実施）。

Supabase Dashboard で以下 2 箇所を設定します。

#### 1. メール認証ポリシー（`Authentication → Sign In / Up → Email`）

| 項目                        | 推奨値                 | 理由                            |
| --------------------------- | ---------------------- | ------------------------------- |
| **Confirm email**           | ON                     | 到達性保証 / なりすまし登録防止 |
| **Secure email change**     | ON                     | メール変更時の乗っ取り防止      |
| **Minimum password length** | 8                      | アプリ側 Zod スキーマと一致     |
| **Password requirements**   | 数字 + 小文字 + 大文字 | アプリ側 Zod と二重防御         |

#### 2. メールテンプレート（`Authentication → Emails → Templates`）

サインアップ確認メール / パスワードリセットメール / メール変更メールの本文を、自社の名前と署名に置き換えます。**`{{ .ConfirmationURL }}` は使わず、`{{ .TokenHash }}` ベースの `/auth/confirm` 経由のリンク**にする必要があります（プリフェッチ・スキャナ耐性のため）。

> 完全な設定値・テンプレ HTML サンプルは [.claude/deployment.md「セキュリティ設定」](.claude/deployment.md#セキュリティ設定) に揃っています。Claude Code に「`.claude/deployment.md` のセキュリティ設定セクションに従って Supabase Dashboard 用のメールテンプレ HTML を出して」と頼めば、コピペ可能な形で出力してくれます。

その他の Dashboard 設定（OTP expiry / Sessions / MFA など）も同ドキュメントの **本番環境チェックリスト** に集約されています。

### Step 6: Cloudflare Workers にデプロイ（GUI）

Cloudflare 公式の **Workers Builds**（GitHub 連携で自動デプロイ）を使います。Cloudflare には **ビルド時の env**（Vite が `astro build` 中に読む）と **ランタイムの env**（Worker が本番リクエストで `env.X` として読む）の 2 系統があり、登録場所が分かれています。Step 6 でビルド時を、Step 7 でランタイムを設定します。

#### 6-1. Worker を作成する

1. <https://dash.cloudflare.com/> にログイン
2. 左サイドバーの **"Workers & Pages"** をクリック
3. 青い **"Create"** ボタン → 上部の **"Import a repository"** タブを選択
4. **"Connect GitHub"** をクリック → Cloudflare の GitHub App をインストール
   - **"Only select repositories"** を選び、Step 1 で作ったリポジトリだけを許可（最小権限）
5. 連携後、リポジトリ一覧から Step 1 のリポジトリを選択
6. ビルド設定を以下のように入力:

   | 項目                | 値                                                                                                                    |
   | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
   | **Worker name**     | `member-site-template`（[wrangler.jsonc](wrangler.jsonc) の `name` と一致させる。変えたい場合は事前にローカルで変更） |
   | **Branch**          | `main`                                                                                                                |
   | **Build command**   | `npm run build`                                                                                                       |
   | **Deploy command**  | `npx wrangler deploy`                                                                                                 |
   | **Root directory**  | （空のまま）                                                                                                          |
   | **Node.js version** | `22`                                                                                                                  |

#### 6-2. Build variables を登録（公開値のみ）

同じ画面の **"Build variables and secrets"** セクションを展開し、`PUBLIC_*` の **3 つだけ** を登録します。これらは **ビルド時** に Vite がバンドルへ inline する値です。

| 種別         | 変数名                            | 値                                                                                                        |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Variable** | `PUBLIC_SUPABASE_URL`             | Step 2 でコピーした Project URL                                                                           |
| **Variable** | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Step 2 でコピーした Publishable key                                                                       |
| **Variable** | `PUBLIC_SITE_URL`                 | デプロイ後の URL（例: `https://member-site-template.<your-subdomain>.workers.dev`）。後で正しい値に更新可 |

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` をここに書かない**。Build variables は **ビルド中だけ** 有効で、Workers ランタイムには引き継がれません（[Cloudflare 公式](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)）。誤って書いてもビルドは通りますが、本番リクエストで `env.SUPABASE_SERVICE_ROLE_KEY` が `undefined` になり、admin 機能が全滅します。Service Role key は Step 7 で別の場所に登録します。

#### 6-3. 初回デプロイ

**"Save and Deploy"** をクリック → ビルドログが流れます（2〜4 分）。完了後、画面上部に `https://member-site-template.<your-subdomain>.workers.dev` の URL が表示されます。**この時点ではまだ Service Role key が無いので、admin 機能と一部のサーバ処理は動きません**。次の Step 7 で登録します。

### Step 7: ランタイム Secret を登録（GUI）

Step 6 で作成された Worker の管理画面に移動し、ランタイムの env が読む秘匿値（Service Role key）を **別の場所** に登録します。

1. **Cloudflare Dashboard > Workers & Pages > 該当 Worker（`member-site-template`）** を開く
2. 上部の **"Settings"** タブ → 左メニューの **"Variables and Secrets"** セクションを開く（**"Bindings > Secrets Store" ではない**）
3. **"Add"** をクリック → 種別の切り替えで **"Secret"** を選ぶ（"Variable" ではなく "Secret"）
4. 以下を入力して **"Save"**:

   | 項目        | 値                                                                                  |
   | ----------- | ----------------------------------------------------------------------------------- |
   | **Type**    | **Secret**（必ず Secret。Variable に入れると暗号化されず、漏洩リスクが高まる）      |
   | **Name**    | `SUPABASE_SERVICE_ROLE_KEY`                                                         |
   | **Value**   | Step 2 でコピーした Service Role key                                                |

> ⚠️ **2 系統の env を混同しないこと**:
>
> - **Build variables**（Step 6-2 で登録した場所）: `Settings > Builds > Build variables and secrets`。ビルド時のみ有効。
> - **Runtime variables/secrets**（Step 7 で登録するこの場所）: `Settings > Variables and Secrets`。Worker のランタイム env が読む。
>
> Service Role key を Build variables に書くと本番で `undefined` になります。逆に `PUBLIC_*` を Runtime に書いても、それらはクライアント JS にも inline する設計なのでビルド時に値が必要で、ランタイムだけに置いても意味がありません（Step 6-2 の場所が正解）。

ランタイム Secret は **登録後すぐ反映される**ので、再デプロイは不要です。ブラウザでサイトをリロードすれば admin 機能も動き始めます。

### Step 8: 動作確認（GUI）

本番 URL にアクセスして:

- サインアップ → 入力したメール宛に確認メールが届く（迷惑メールも確認）
- メール内のリンクから確認 → サインインして `/member/dashboard` に到達
- プロフィール編集・投稿作成が動く

うまく動かない場合:

- Cloudflare Dashboard の該当 Worker → **"Logs"** タブでエラーログを確認
- Supabase Dashboard の **Authentication → Users** で実際にユーザーが作成されているか確認
- `/member` や `/admin` で 500 が出るときは、Service Role key が **Settings > Variables and Secrets** に **Secret** として登録されているかを再確認（Build variables 側に入っていると `undefined` になる）

### Step 9: 初期 admin の設定（GUI / 任意）

`/admin` 画面を使うには、自分のアカウントを admin に昇格させます。

Supabase Dashboard → **SQL Editor** → 新規クエリで以下を実行:

```sql
update profiles set role = 'admin' where user_id = (
  select id from auth.users where email = '<自分のメールアドレス>'
);
```

ブラウザで `/admin` をリロード → 管理画面に入れます。詳細手順（CLI 経路 / Option A vs B の選択）は [.claude/deployment.md「初期 admin の bootstrap」](.claude/deployment.md#初期-admin-の-bootstrap必須1-回限り) を参照。

---

## 次にやること

| やりたいこと                                   | 入口                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 自分のサイトに合わせてブランド変更（色・名前） | Claude Code に「`src/components/` と `src/styles/global.css` のブランドカラー / サイト名を `<新しい名前>` に置き換えて」と依頼                 |
| Google ログインを足す                          | [.claude/deployment-optional.md「Google OAuth セットアップ（任意）」](.claude/deployment-optional.md#google-oauth-セットアップ任意) |
| カスタムドメインを当てる                       | [.claude/deployment.md「カスタムドメイン設定」](.claude/deployment.md#カスタムドメイン設定オプション)                               |
| 機能を追加・変更する                           | Claude Code に [CLAUDE.md](CLAUDE.md) を読ませて指示（自動で読み込まれます）                                                                   |
| セキュリティ運用（依存更新 / レビュー手順）    | [.claude/security.md](.claude/security.md)                                                                                                     |
| DB スキーマや RLS を変更する                   | [.claude/database.md](.claude/database.md) + Claude Code に「`/db-check` で検証して」と依頼                                                    |

---

## 技術スタック

| レイヤ         | 採用技術                                 |
| -------------- | ---------------------------------------- |
| フレームワーク | Astro 6.x（SSR）+ Vue 3                  |
| スタイル       | Tailwind CSS 4.x                         |
| バックエンド   | Supabase（Auth / Postgres / Storage）    |
| ランタイム     | Cloudflare Workers（Static Assets 併用） |
| アダプター     | `@astrojs/cloudflare`                    |

詳細なアーキテクチャ・ディレクトリ構成は [.claude/architecture.md](.claude/architecture.md) を参照。

---

## ドキュメント索引

このテンプレを使い込むときに参照するドキュメント。Claude Code は `CLAUDE.md` 経由でこれらを必要に応じて読みに行きます。

- [CLAUDE.md](CLAUDE.md) — プロジェクト概要・運用ルール（Claude Code 自動読み込み）
- [.claude/architecture.md](.claude/architecture.md) — アーキテクチャ・ディレクトリ構成
- [.claude/database.md](.claude/database.md) — DB スキーマ・RLS・マイグレーション運用
- [.claude/security.md](.claude/security.md) — セキュリティチェックリスト・レビュー手順
- [.claude/development.md](.claude/development.md) — コーディング規約・命名規則
- [.claude/deployment.md](.claude/deployment.md) — 本番デプロイ詳細（必須項目）
- [.claude/deployment-optional.md](.claude/deployment-optional.md) — Workers Builds / Turnstile / Google OAuth など任意機能

---

## License

[MIT](LICENSE) © Michio Fujii
