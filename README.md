# Astro Vue Supabase Cloudflare Template

会員サイトを最短で立ち上げるためのテンプレート。Astro + Vue + Supabase + Cloudflare Workers で、認証 / プロフィール / 投稿 / 管理画面 / RLS / セキュリティヘッダがすべて初期実装済み。

**初期セットアップは決まったコマンドをコピペするだけ。機能追加・カスタマイズは Claude Code に日本語で頼むだけ。**

| 担当            | 操作                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **人間**        | Supabase / Cloudflare / GitHub の Dashboard 操作 / ターミナルで決まったコマンドをコピペ実行 / `.env` と `.dev.vars` への秘密値の貼り付け / ブラウザでの動作確認 / Claude Code への指示 |
| **Claude Code** | コード変更全般 / 機能追加 / リファクタリング / DB マイグレーション設計 / レビュー / git・gh の運用補助                                                                                 |

> 🔒 **Supabase の Service Role key などの秘密値は、ユーザー自身がエディタで `.env` / `.dev.vars` に直接書き込みます**。チャット欄に貼ると会話履歴に残るリスクがあるため、Claude Code には渡さない運用です（プレースホルダや `.env.example` の編集は Claude Code に任せて OK）。

---

## 必要なもの

- **[Claude Code](https://claude.com/claude-code)** — コード変更・機能追加・レビューを代行する AI エージェント（セットアップ後の機能開発フェーズで使用）
- **[Supabase](https://supabase.com/dashboard) アカウント** — 無料プランで OK
- **[Cloudflare](https://dash.cloudflare.com/) アカウント** — 無料プランで OK
- **GitHub アカウント**
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** がインストールされた PC — ローカル DB 用（`npm run db:start` で利用）

---

## 30 分でローカルで動かす

GUI 操作（Dashboard）とターミナルへのコマンドコピペを交互に行います。コマンドは固定なので、内容を理解せずそのまま貼り付ければ動きます。機能追加やカスタマイズに入る段階から Claude Code を使います。

### Step 1: GitHub で自分のリポジトリを作る（GUI）

このリポジトリのページ右上、緑色の **"Use this template"** ボタンをクリックし、**"Create a new repository"** を選びます。

- **Repository name**: 任意（例: `my-club`）
- **Public / Private**: どちらでも可（迷ったら Private 推奨）

**"Create repository"** をクリックして数秒待つと、自分のリポジトリができあがります。次の Step に進む前に、リポジトリページ右上の緑色の **"Code"** ボタン → **"HTTPS"** タブで表示される URL（`https://github.com/<your-name>/<repo>.git`）をコピーしておきます。Step 3-1 の `git clone` コマンドで使います。

### Step 2: Supabase で新規プロジェクトを作る（GUI）

1. <https://supabase.com/dashboard> にログイン
2. 画面右上の緑色の **"New project"** ボタンをクリック
3. 以下を入力して **"Create new project"** をクリック:
   - **Project name**: 任意（例: `my-club`）
   - **Database Password**: ランダムな強いパスワードを生成し、**パスワードマネージャに保存**（後の本番運用で使います）
   - **Region**: 利用者が多い地域に近い場所（日本なら **"Northeast Asia (Tokyo)"**）
4. プロジェクトが **"Setting up project"** 状態になります → 1〜2 分待ちます

完成したら、左サイドバーの **歯車アイコン (Project Settings) → API** を開きます。以下 3 つの値を **パスワードマネージャに保存** しておきます。**用途は本番デプロイ（Step 6〜7）のみで、ローカル開発では使いません** — ローカル開発は Step 3-2 で起動する Docker 上のローカル Supabase が独自の URL / キーを発行するので、それを `.env` / `.dev.vars` に書きます:

| 欄の表示名             | 用途             | 説明                                                                     |
| ---------------------- | ---------------- | ------------------------------------------------------------------------ |
| **"Project URL"**      | 本番（Step 6-2） | `https://<ref>.supabase.co` 形式                                         |
| **"Publishable key"**  | 本番（Step 6-2） | `eyJ...` または `sb_publishable_...` で始まる長い文字列（公開してよい）  |
| **"Service Role key"** | 本番（Step 7）   | `eyJ...` で始まる長い文字列（**絶対に他人に見せない / コミットしない**） |

> Service Role key の右にある 👁 アイコンを押すと値が表示されます。コピー後、画面は早めに閉じてください。

> ⚠️ **本番値をローカル `.env` に入れない** — `src/lib/supabase.ts` は `import.meta.env.PUBLIC_SUPABASE_URL` をそのまま使うため、本番 Project URL を local `.env` に書くと `npm run dev` でも本番 Supabase に接続してしまい、テストデータが本番に書き込まれます。Service Role key も同様に local `.dev.vars` に入れると admin 系 Action が本番 DB に対して service role 権限で動作する危険があります。ローカル開発では Step 3-2 で得る **ローカル Supabase の URL / キー** だけを使ってください。

### Step 3: ローカル開発環境を立ち上げる（ターミナル + エディタ）

PC のお好きな場所（例: `~/Developer/`）でターミナルを開き、以下を順に実行します。コマンドは固定なので **そのままコピペで貼り付ければ OK** です。Step 2 で控えた本番値はここでは **使いません**。

#### 3-1. リポジトリを clone して依存関係をインストール（ターミナル）

`<Step 1 でコピーした URL>` の部分だけ自分の値に置き換えてください。

```bash
git clone <Step 1 でコピーした URL>
cd <リポジトリ名>
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
```

最後の 2 行で、空の `.env` と `.dev.vars` がリポジトリルートに作られます（次のステップで値を埋めます）。

#### 3-2. ローカル Supabase を起動して URL / キーを取得（ターミナル）

Docker Desktop を起動した状態で、リポジトリのルートで以下を実行します。

```bash
npm run db:start
```

初回は Docker image 取得で 1〜3 分かかります。完了すると、ターミナルに以下のような **ローカル Supabase の URL とキー** が表示されます:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOi...（長い文字列）
service_role key: eyJhbGciOi...（長い文字列）
   Publishable key: sb_publishable_...
       Secret key: sb_secret_...
```

> 出力を消してしまった場合は `npx supabase status` で再表示できます。

ここで表示される **API URL / Publishable key（または anon key）/ service_role key** が、次のステップで `.env` / `.dev.vars` に書く値です。**Step 2 の本番値は使いません。**

#### 3-3. `.env` と `.dev.vars` に Step 3-2 の **ローカル値** を書き込む（エディタ）

clone したリポジトリをお好みのエディタ（VS Code 等）で開き、以下 2 ファイルを編集します。**Service Role key などの秘密値は Claude Code のチャット欄には貼らず、自分でファイルに直接書き込みます**（会話履歴に残さないため）。

`.env`（公開値、リポジトリルート）:

```bash
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Step 3-2 で表示された Publishable key（または anon key）>
```

`.dev.vars`（ローカル開発用の秘密値、リポジトリルート）:

```bash
SUPABASE_SERVICE_ROLE_KEY=<Step 3-2 で表示された service_role key>
```

`.env` / `.dev.vars` はどちらも `.gitignore` 対象なので、誤ってコミットされる心配はありません。

> ⚠️ **Step 2 の本番値（`https://<ref>.supabase.co` 形式の URL や hosted Service Role key）をここに書かない** — local の `.env` に本番値を入れると、`npm run dev` 起動時にアプリが本番 Supabase に接続し、テストデータが本番 DB に書き込まれます。Step 2 の値は Step 6〜7（Cloudflare Dashboard 登録時）でのみ使います。

#### 3-4. マイグレーション適用と開発サーバ起動（ターミナル）

```bash
npm run db:reset    # 全マイグレーション適用（ローカル DB を初期化）
npm run dev         # 開発サーバ起動
```

`npm run dev` がローカル URL（通常 <http://localhost:4321>）を表示したら成功です。

### Step 4: ブラウザで動作確認（GUI）

Step 3-4 の `npm run dev` が表示するローカル URL（通常 <http://localhost:4321>）をブラウザで開いて、以下を確認します:

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

本番では Step 2 で作成した hosted Supabase プロジェクトを使います（ローカル開発で使った Docker 上のローカル Supabase は本番には関係ありません）。Step 2 のときに保存した Project URL / Publishable key / Service Role key をここから先で使います。

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

> 💡 **Supabase Advisor で `Leaked Password Protection Disabled` 警告が出ている場合** — Free プランの仕様で Dashboard 機能が使えないだけ（バグではない）。本テンプレートはアプリ層フォールバック（`ENABLE_HIBP_CHECK=true` で HIBP API 照会）を備えているので、警告は **想定内** として扱って問題ない。プラン別の対応方針・Pro 移行時のスイッチング手順は [.claude/security-ops.md「Supabase Advisor で残る想定済み警告と対応」](.claude/security-ops.md#supabase-advisor-で残る想定済み警告と対応) を参照。

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

   | 項目      | 値                                                                             |
   | --------- | ------------------------------------------------------------------------------ |
   | **Type**  | **Secret**（必ず Secret。Variable に入れると暗号化されず、漏洩リスクが高まる） |
   | **Name**  | `SUPABASE_SERVICE_ROLE_KEY`                                                    |
   | **Value** | Step 2 でコピーした Service Role key                                           |

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

## 次にやること: Claude Code への頼み方の例

カスタマイズ・機能追加は **Claude Code に日本語で頼むだけ** で進められます。リポジトリ直下の [CLAUDE.md](CLAUDE.md) が起動時に自動で読み込まれ、Claude Code は規約（コーディング・命名・セキュリティ・DB マイグレーションの 7 ステップ等）に従って作業します。利用者がディレクトリ構造や CLI を覚える必要はありません。

| やりたいこと                         | Claude Code への頼み方の例（コピペして編集）                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ブランドカラー・サイト名を変える     | 「ブランドカラーを `#2563eb` に、サイト名を "○○ クラブ" に変えて。`src/styles/global.css` の `@theme` と各レイアウトのヘッダ見出しが対象」                                              |
| プロフィールに項目を追加             | 「プロフィールに自己紹介 (bio) を 200 文字までで保存できるようにして。CLAUDE.md の DB 変更 7 ステップに沿って migration / RLS / pgTAP テストまで作って、最後に `/db-check` を走らせて」 |
| 新しい会員ページを作る               | 「`/member/events` ページを作って、admin だけが投稿できて会員全員が読める形にして。RLS と Astro Action の認可チェックも忘れずに」                                                       |
| Google ログインを追加                | 「Google OAuth を有効にしたい。`.claude/deployment-optional.md` の Google OAuth セクションを読んで、必要なコード変更とセットアップ手順を教えて」                                        |
| カスタムドメインを当てる             | 「`example.com` を Cloudflare Workers に紐付けたい。`.claude/deployment.md` のカスタムドメイン設定に沿って、Cloudflare Dashboard 側で何をすればいいか手順を教えて」                     |
| Dependabot PR の確認・マージ         | 「open になっている Dependabot PR を `/pr-triage` で分類して、patch / minor は安全に merge できるか教えて」                                                                             |
| 本番デプロイ前のセキュリティレビュー | PR を作ったあとに `/codex-cross-review <PR 番号>` を投げる（Codex × Claude Code の収束ループが LGTM までレビューを反復）                                                                |
| 「これってどうなってるの？」         | 「`/member/profile` ページが Supabase の何を読み書きしてるか、関連ファイルを辿って説明して」                                                                                            |

> 💡 上の例は **そのまま投げても動きます**。具体的に書くほど Claude Code の精度が上がるので、`<200 文字>` `<example.com>` のような部分を自分の数字・名前に置き換えて使ってください。詰まったら「`CLAUDE.md` の規約に従って」「公式ドキュメントを `WebFetch` で確認して」と添えるとさらに精度が上がります。

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
- [.claude/deployment-optional.md](.claude/deployment-optional.md) — Workers Builds / Google OAuth など任意機能

---

## License

[MIT](LICENSE) © Michio Fujii
