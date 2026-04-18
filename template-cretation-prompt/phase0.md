# Phase 0: プロジェクト初期化手順書

**これは Claude Code に渡すプロンプトではありません。**
あなた（Michioさん）がターミナルで手動実行する手順書です。
Phase 1 / Phase 2 のプロンプトは、この Phase 0 が完了した状態を前提に書かれています。

---

## 🎯 このフェーズのゴール

Astro 公式の最新テンプレートと、公式 CLI（`astro add`）で追加できるすべてのインテグレーションを
セットアップし、**Astro チームがメンテしているベストプラクティスに完全に乗る**こと。

これにより以下が自動的に正しくセットアップされる:

- `package.json`（依存パッケージは最新版）
- `astro.config.mjs`（`output`、`adapter`、`integrations`、`vite.plugins` 設定済み）
- `tsconfig.json`（strict プリセット）
- `wrangler.jsonc`（Cloudflare CLI が生成した推奨設定）
- `public/favicon.svg`
- `src/styles/global.css`（`@import "tailwindcss"` 入り）
- `.gitignore`（最新ベストプラクティス）

---

## 📋 前提条件

- Node.js **22.12.0 以上**（Astro 6 の要件）
  ```bash
  node -v
  # v22.12.0 以上が表示されればOK
  ```
- Cloudflare アカウントを持っている
- GitHub アカウントを持っている
- Supabase プロジェクトを作成済み（URL と Publishable Key を取得済み）

---

## Step 1. Astro プロジェクトを作成

プロジェクトを置きたいディレクトリに移動してから実行:

```bash
npm create astro@latest funegaku-members -- \
  --template minimal \
  --no-git \
  --install \
  --yes
```

**フラグの意味**:
- `--template minimal`: 最小構成のテンプレート（余計なサンプルコードが入らない）
- `--no-git`: git init をスキップ（あとで自分で init する）
- `--install`: 依存を自動インストール
- `--yes`: すべての確認プロンプトに yes と答える

完了すると `funegaku-members/` ディレクトリができる。

```bash
cd funegaku-members
```

---

## Step 2. Cloudflare アダプタを追加

```bash
npx astro add cloudflare --yes
```

これが自動で行うこと:
- `@astrojs/cloudflare` を devDependencies に追加
- `astro.config.mjs` に `import cloudflare from '@astrojs/cloudflare'` と `adapter: cloudflare()` を追記
- `output: 'server'` に変更

**確認**: `astro.config.mjs` を開いて、`cloudflare` アダプタが設定されていることを確認。

---

## Step 3. Vue インテグレーションを追加

```bash
npx astro add vue --yes
```

これが自動で行うこと:
- `@astrojs/vue` と `vue` を dependencies に追加
- `astro.config.mjs` の `integrations` 配列に `vue()` を追記
- `tsconfig.json` に Vue 用の設定を追記

---

## Step 4. Tailwind CSS を追加

```bash
npx astro add tailwind --yes
```

これが自動で行うこと:
- `@tailwindcss/vite` と `tailwindcss` を devDependencies に追加
- `astro.config.mjs` の `vite.plugins` に `tailwindcss()` を追記
- `src/styles/global.css` を作成（`@import "tailwindcss"` 入り）

**注意**: 一部の Astro のバージョンでは、テンプレートの layouts で `global.css` の import を
追加するよう案内が出ることがある。その場合は画面の指示に従ってEnterを押すだけでOK。

---

## Step 5. Supabase 関連パッケージを追加

Supabase は `astro add` に対応していないので、手動でインストール:

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

## Step 6. Wrangler 型定義を生成

Cloudflare Workers の環境変数型定義 `worker-configuration.d.ts` を生成:

```bash
npx wrangler types
```

ファイルが生成されなくても、Phase 1 実行時に改めて生成されるので問題なし。

---

## Step 7. Git リポジトリを初期化

```bash
git init
git add .
git commit -m "Initial commit from Astro template"
```

---

## Step 8. Supabase ダッシュボードで設定を完了

### 8-1. メールテンプレート変更（必須）

`Authentication` > `Email Templates` > `Confirm signup` を開き、
本文内の `{{ .ConfirmationURL }}` を以下に変更:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
```

### 8-2. URL Configuration 設定

`Authentication` > `URL Configuration`:

- **Site URL**: 本番ドメインを設定（デプロイ後に変更でもOK）
  - 例: `https://funegaku-members.your-subdomain.workers.dev`
- **Redirect URLs**: 以下を追加
  - `http://localhost:4321/**`
  - `http://localhost:4321/auth/callback`
  - 本番ドメイン `/auth/callback`

### 8-3. API キー取得

`Settings` > `API Keys` で以下をメモ:

- **Publishable Key**（`sb_publishable_xxx` の形式） → Phase 1 の `.env` で使う
- **Service Role Key**（`eyJxxx...` の JWT 形式） → Phase 1 の `.dev.vars` で使う
- **Project URL**（`https://xxx.supabase.co`）→ Phase 1 の両方で使う

---

## Step 9. ディレクトリ構造の確認

ここまで完了すると、以下の構造になっているはず:

```
funegaku-members/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   │   └── astro.svg
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css
├── .gitignore
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── wrangler.jsonc          # （astro add cloudflare で自動生成）
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

## Step 10. 動作確認

開発サーバが起動することを確認:

```bash
npm run dev
```

ブラウザで `http://localhost:4321` にアクセスして、
Astro のデフォルトページが表示されればPhase 0完了。

`Ctrl+C` で開発サーバを停止。

---

## ✅ Phase 0 完了チェック

以下がすべて完了していれば次に進める:

- [ ] `funegaku-members/` ディレクトリが作成された
- [ ] `package.json` に `@astrojs/cloudflare`、`@astrojs/vue`、`@tailwindcss/vite`、
      `@supabase/supabase-js`、`@supabase/ssr` が入っている
- [ ] `astro.config.mjs` に Cloudflare アダプタ、Vue、Tailwind が設定されている
- [ ] `wrangler.jsonc` が生成されている
- [ ] `public/favicon.svg` がある
- [ ] `npm run dev` で開発サーバが起動する
- [ ] Supabase の URL / Publishable Key / Service Role Key をメモ済み
- [ ] メールテンプレートとリダイレクトURLを設定済み

---

## 🚀 次のステップ

Phase 1 プロンプト（`phase1-main-implementation.md`）を Claude Code に渡して、
会員サイトの本体機能を実装してもらう。

Phase 1 実行時は、冒頭にプロジェクトコンテキスト（`.claude/CLAUDE.md` など）を
添付してからプロンプトを貼り付ける。