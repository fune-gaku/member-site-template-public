# Phase 0: プロジェクト初期化手順書

**これは Claude Code に渡すプロンプトではありません。**
あなた（Michioさん）がターミナルで手動実行する手順書です。
Phase 1 / Phase 2 のプロンプトは、この Phase 0 が完了した状態を前提に書かれています。

---

## 🎯 このフェーズのゴール

GitHub の Claude プロジェクトテンプレート（`.claude/` 配下の運用ドキュメント入り）から
clone した既存ディレクトリに、**Astro 公式の最新テンプレート + 公式 CLI で追加できる
すべてのインテグレーション**をマージする。

これにより以下が揃った状態になる:

- `.claude/` 配下の Claude Code 運用ドキュメント（テンプレートリポジトリから引き継ぎ）
- `package.json`（Astro 公式最新版の依存）
- `astro.config.mjs`（`output`、`adapter`、`integrations`、`vite.plugins` 設定済み）
- `tsconfig.json`（strict プリセット）
- `wrangler.jsonc`（Cloudflare CLI が生成した推奨設定）
- `public/favicon.svg`
- `src/styles/global.css`（`@import "tailwindcss"` 入り）
- Supabase 関連パッケージ

---

## 📋 前提条件

- **Node.js 22.12.0 以上**（Astro 6 の要件）
  ```bash
  node -v
  # v22.12.0 以上が表示されればOK
  ```
- `gh`（GitHub CLI）または `git` コマンドが使える
- `rsync` コマンドが使える（macOS / Linux は標準装備、Windows は WSL または Git Bash 推奨）
- Cloudflare アカウントを持っている
- Supabase プロジェクトを作成済み（URL と Publishable Key を取得済み）

---

## Step 1. GitHub テンプレートリポジトリから clone

*※ すでにクローン済みの場合はこのステップをスキップして Step 2 へ進んでください**

Claude プロジェクトテンプレート（`.claude/` や `init-claude.sh` 入り）から新プロジェクトを作成:

```bash
# 親ディレクトリに移動
cd ~/Documents/GitHub

# GitHub テンプレートから clone（gh CLI を使う場合）
gh repo create member-site-template \
  --template <your-github>/claude-project-template \
  --public \
  --clone

# または git clone の場合
# git clone https://github.com/<your-github>/claude-project-template.git funegaku-members
# cd funegaku-members && rm -rf .git && git init

cd member-site-template
```

**確認**: `ls -la` で `.claude/` ディレクトリと `init-claude.sh` があることを確認。

---

## Step 2. Claude プロジェクトテンプレートの初期化

```bash
./init-claude.sh
```

`./init-claude.sh` 実行時に入力する回答を事前にまとめたもの。
上から順に聞かれる想定。

## 基本情報

| 質問 | 入力値 |
|---|---|
| プロジェクト名 | `Astro Vue Supabase Cloudflare Template` |
| プロジェクト概要 | `Astro + Vue + Supabase + Cloudflare Workers を使った会員サイトテンプレート（SSR・認証・Storage・Admin機能完備）` |
| 使用者数 | `テンプレート利用者（開発者および利用企業）` |
| 開発方針 | `型安全で公式推奨の実装パターンを厳守し、セキュリティとメンテナンス性を最優先` |

## 技術スタック

| 質問 | 入力値 |
|---|---|
| フロントエンドフレームワーク | `Astro 6` |
| UIライブラリ | `Vue 3` |
| CSSフレームワーク | `Tailwind CSS v4` |
| バックエンド | `Supabase` |
| デプロイ先 | `Cloudflare Workers` |

## データベース

| 質問 | 入力値 |
|---|---|
| DBMS | `PostgreSQL (Supabase)` |
| スキーマ管理方法 | `Supabase Migrations (supabase/migrations/*.sql を Git で管理し、本番適用は SQL Editor から手動実行)` |


**注**: 自動置換されないプレースホルダーは、Phase 1 完了後に手動で埋めれば良い。
Phase 0 の段階では Astro プロジェクトを作成することが優先。

---

## Step 3. 一時ディレクトリに Astro プロジェクトを作成

Claude テンプレートのファイルと衝突しないよう、いったん親ディレクトリの
一時フォルダに Astro プロジェクトを作成する。

**重要**: `npm create astro@latest` は**完全に空のディレクトリ**にしかインストールできない
仕様のため（公式チュートリアル記載）、既存の `.claude/` などがある funegaku-members/
に直接展開はできない。そのため一時ディレクトリに作ってから rsync でマージする。

```bash
# 現在地を確認（funegaku-members にいるはず）
pwd
# → ~/Documents/GitHub/funegaku-members

# 親ディレクトリに戻って、一時フォルダに Astro を作成
cd ..
npm create astro@latest .astro-temp -- \
  --template minimal \
  --no-git \
  --install \
  --yes
```

**フラグの意味**:
- `--template minimal`: 最小構成のテンプレート（余計なサンプルコードが入らない）
- `--no-git`: git init をスキップ（後で funegaku-members 側の git を使うため）
- `--install`: 依存を自動インストール
- `--yes`: すべての確認プロンプトに yes と答える

完了すると `.astro-temp/` ディレクトリに Astro プロジェクト一式ができる。

---

## Step 4. Astro のファイルを funegaku-members/ にマージ

`rsync` で `.git` と `node_modules` を除外しつつコピー:

```bash
rsync -av \
  --exclude='.git' \
  --exclude='node_modules' \
  .astro-temp/ funegaku-members/
```

**ポイント**:
- `.astro-temp/` の末尾スラッシュに注意（中身をコピー。スラッシュがないとディレクトリごとコピーになる）
- `--exclude='.git'`: Astro が作った隠れ `.git` があれば除外
- `--exclude='node_modules'`: サイズが大きいので除外（後で再インストール）

---

## Step 5. 一時ディレクトリを削除

```bash
rm -rf .astro-temp
```

---

## Step 6. funegaku-members で依存を再インストール

```bash
cd funegaku-members
npm install
```

これで `node_modules/` が作成される。

**確認**:
```bash
ls -la
# .claude/ と src/、public/、astro.config.mjs、package.json が揃っているはず
```

---

## Step 7. Cloudflare アダプタを追加

```bash
npx astro add cloudflare --yes
```

これが自動で行うこと:
- `@astrojs/cloudflare` を devDependencies に追加
- `astro.config.mjs` に `import cloudflare from '@astrojs/cloudflare'` と `adapter: cloudflare()` を追記
- `output: 'server'` に変更
- `wrangler.jsonc` を生成

**確認**: `cat astro.config.mjs` で cloudflare アダプタが設定されていることを確認。

---

## Step 8. Vue インテグレーションを追加

```bash
npx astro add vue --yes
```

これが自動で行うこと:
- `@astrojs/vue` と `vue` を dependencies に追加
- `astro.config.mjs` の `integrations` 配列に `vue()` を追記
- `tsconfig.json` に Vue 用の設定を追記

---

## Step 9. Tailwind CSS を追加

```bash
npx astro add tailwind --yes
```

これが自動で行うこと:
- `@tailwindcss/vite` と `tailwindcss` を devDependencies に追加
- `astro.config.mjs` の `vite.plugins` に `tailwindcss()` を追記
- `src/styles/global.css` を作成（`@import "tailwindcss"` 入り）

**注意**: 画面の指示で layout に `global.css` の import を促されたら Enter で承認。

---

## Step 10. Supabase 関連パッケージを追加

Supabase は `astro add` に対応していないので手動インストール:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

## Step 11. Wrangler 型定義を生成

Cloudflare Workers の環境変数型定義 `worker-configuration.d.ts` を生成:

```bash
npx wrangler types
```

**注**: この段階では秘密変数が未登録なので型は最小限。
Phase 1 実行後、Workers ダッシュボードで Secret を登録してから再度
`npm run cf-typegen` を走らせると完全な型が得られる。

---

## Step 12. Git コミット

```bash
git add .
git commit -m "Phase 0: Astro + Cloudflare + Vue + Tailwind + Supabase initialized"
```

**注**: `gh repo create --template --clone` を使った場合、すでに git 初期化済み。
`git clone` 方式で `.git` を削除した場合は先に `git init` が必要。

---

## Step 13. Supabase ダッシュボードで設定を完了

### 13-1. メールテンプレート変更（必須）

`Authentication` > `Email Templates` > `Confirm signup` を開き、
本文内の `{{ .ConfirmationURL }}` を以下に変更:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

### 13-2. URL Configuration 設定

`Authentication` > `URL Configuration`:

- **Site URL**: 本番ドメインを設定（デプロイ後に変更でもOK）
  - 例: `https://funegaku-members.your-subdomain.workers.dev`
- **Redirect URLs**: 以下を追加
  - `http://localhost:4321/**`
  - `http://localhost:4321/auth/callback`
  - 本番ドメイン `/auth/callback`

### 13-3. API キー取得

`Settings` > `API Keys` で以下をメモ:

- **Publishable Key**（`sb_publishable_xxx` の形式）→ Phase 1 の `.env` で使う
- **Service Role Key**（`eyJxxx...` の JWT 形式）→ Phase 1 の `.dev.vars` で使う
- **Project URL**（`https://xxx.supabase.co`）→ Phase 1 の両方で使う

---

## Step 14. ディレクトリ構造の確認

ここまで完了すると、以下の構造になっているはず:

```
funegaku-members/
├── .claude/                # Claude プロジェクトテンプレート由来
│   ├── CLAUDE.md
│   ├── architecture.md
│   ├── database.md
│   ├── security.md
│   ├── development.md
│   ├── deployment.md
│   ├── templates/
│   └── phases/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css
├── .gitignore              # Astro 由来
├── astro.config.mjs
├── init-claude.sh          # Claude テンプレート由来
├── package.json
├── tsconfig.json
├── wrangler.jsonc
└── node_modules/
```

**確認コマンド**:
```bash
ls -la
cat astro.config.mjs
cat wrangler.jsonc
cat package.json
```

`astro.config.mjs` が以下のような内容になっていればOK（厳密一致でなくて良い）:

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

---

## Step 15. 動作確認

開発サーバが起動することを確認:

```bash
npm run dev
```

ブラウザで `http://localhost:4321` にアクセスして、
Astro のデフォルトページが表示されれば Phase 0 完了。

`Ctrl+C` で開発サーバを停止。

---

## ✅ Phase 0 完了チェック

以下がすべて完了していれば次に進める:

- [ ] `funegaku-members/` ディレクトリに `.claude/` と Astro プロジェクトが共存
- [ ] `package.json` に `@astrojs/cloudflare`、`@astrojs/vue`、`@tailwindcss/vite`、
      `@supabase/supabase-js`、`@supabase/ssr` が入っている
- [ ] `astro.config.mjs` に Cloudflare アダプタ、Vue、Tailwind が設定されている
- [ ] `wrangler.jsonc` が生成されている
- [ ] `public/favicon.svg` がある
- [ ] `npm run dev` で開発サーバが起動する
- [ ] Supabase の URL / Publishable Key / Service Role Key をメモ済み
- [ ] メールテンプレートとリダイレクトURLを設定済み
- [ ] 初回 commit が済んでいる

---

## 🚀 次のステップ

Phase 1 プロンプト（`phase1-main-implementation.md`）を Claude Code に渡して、
会員サイトの本体機能を実装してもらう。

Phase 1 実行時は、冒頭にプロジェクトコンテキスト（`.claude/CLAUDE.md` 等）を
添付してからプロンプトを貼り付ける。

---

## 🛟 トラブルシューティング

### `rsync: command not found`（Windows）

Windows で `rsync` がない場合、以下で代用できる:

```powershell
# PowerShell
Robocopy .astro-temp funegaku-members /E /XD .git node_modules
```

または Git Bash / WSL を使う。

### `npm create astro@latest` 実行中にエラー

Node.js のバージョンが古い可能性。`node -v` で 22.12.0 以上であることを確認。

古い場合は nvm で更新:
```bash
nvm install 22
nvm use 22
```

### `.astro-temp` の削除に失敗

`node_modules` のシンボリックリンクなどで `rm -rf` が失敗する場合:

```bash
# macOS / Linux
chmod -R +w .astro-temp && rm -rf .astro-temp

# 強制削除
sudo rm -rf .astro-temp
```

### `npx astro add` 実行中にエラー

`wrangler.jsonc` の既存コメント部分が原因の場合あり。
その場合は一度 `wrangler.jsonc` を削除してから再実行。