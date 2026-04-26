# Astro Vue Supabase Cloudflare Template

Astro + Vue + Supabase + Cloudflare Workers を使った会員サイトテンプレート。SSR・認証・Storage・Admin 機能・RLS を完備しています。

プロジェクトの詳細は [CLAUDE.md](CLAUDE.md) および [.claude/](.claude/) 配下のドキュメントを参照してください。

---

## 技術スタック

| レイヤ         | 採用技術                                 |
| -------------- | ---------------------------------------- |
| フレームワーク | Astro 6.x（SSR）+ Vue 3                  |
| スタイル       | Tailwind CSS 4.x                         |
| バックエンド   | Supabase（Auth / Postgres / Storage）    |
| ランタイム     | Cloudflare Workers（Static Assets 併用） |
| アダプター     | `@astrojs/cloudflare`                    |

---

## 前提条件

- Node.js `>=22.12.0`（[.nvmrc](.nvmrc) 参照）
- [Supabase](https://supabase.com/) プロジェクト
- [Cloudflare](https://dash.cloudflare.com/) アカウント
- `wrangler` CLI は `devDependencies` に含まれるため、`npx wrangler` で実行できます

---

## セットアップ

```bash
# 依存関係インストール
npm install

# 公開環境変数のテンプレートをコピー
cp .env.example .env

# ローカル用シークレットのテンプレートをコピー
cp .dev.vars.example .dev.vars
```

### 環境変数

| ファイル    | 変数                              | 用途                                                      |
| ----------- | --------------------------------- | --------------------------------------------------------- |
| `.env`      | `PUBLIC_SUPABASE_URL`             | Supabase Project URL（公開値）                            |
| `.env`      | `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key（公開値）                   |
| `.dev.vars` | `SUPABASE_SERVICE_ROLE_KEY`       | Supabase Service Role Key（ローカル開発時のみ。**秘匿**） |

取得元は [Supabase Dashboard > Settings > API](https://supabase.com/dashboard) です。

> `.env` / `.dev.vars` は `.gitignore` 済み。**絶対にコミットしない**こと。

### セキュリティ運用（初回のみ）

秘密情報の誤コミット検知と依存関係の脆弱性検知を有効化します。

1. gitleaks をローカルにインストール（pre-commit hook 用）:

   ```bash
   brew install gitleaks
   ```

   `npm install` 実行時に `.githooks/pre-commit` が有効化され、コミット時に staged ファイルから秘密情報を自動検知します。gitleaks 未インストール時はコミットが中断されます。

2. GitHub リポジトリの Settings > Code security で以下を ON:
   - Dependabot alerts
   - Dependabot security updates

依存関係の脆弱性は CI（[.github/workflows/npm-audit.yml](.github/workflows/npm-audit.yml)）が PR 時と週次で `npm audit --audit-level=high` を自動実行します。詳細は [.claude/security.md](.claude/security.md) を参照。

---

## ローカル開発

```bash
npm run dev
```

内部で `wrangler types && astro dev` が走り、`worker-configuration.d.ts` を再生成してから Astro の dev サーバーを起動します（`localhost:4321`）。

本番と同じ Workers ランタイムで確認したい場合は preview を使います。

```bash
npm run preview
# = wrangler types && astro build && wrangler dev
```

その他のコマンド:

| コマンド            | 内容                                   |
| ------------------- | -------------------------------------- |
| `npm run build`     | 本番ビルド（`./dist/`）                |
| `npm run typecheck` | `astro check` による型チェック         |
| `npm run lint`      | ESLint                                 |
| `npm run format`    | Prettier                               |
| `npm run test`      | Vitest（Cloudflare Workers pool 対応） |

---

## Cloudflare Workers へのデプロイ

[Astro 公式 Cloudflare アダプター](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)と [Cloudflare Workers Astro guide](https://developers.cloudflare.com/workers/frameworks/framework-guides/astro/) に基づく推奨手順です。

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 公開環境変数の設定（`.env`）

`.env` に Supabase の公開値（`PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY`）を記入します。

### 3. ローカル用シークレットの設定（`.dev.vars`）

`.dev.vars` に `SUPABASE_SERVICE_ROLE_KEY` を設定します。このファイルは Git にコミットしないでください。

### 4. ローカル動作確認

```bash
npm run dev
```

### 5. Workers ランタイムでのプレビュー

```bash
npm run preview
```

本番と同じ Workers ランタイムで動作確認できます。

### 6. Cloudflare にログイン

```bash
npx wrangler login
```

### 7. 本番シークレットの登録

本番用の Service Role Key を Workers のシークレットとして登録します。**CLI 経由を推奨**します。

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template
```

プロンプトで値を貼り付けて Enter。登録後は再デプロイ不要で即反映されます。

確認:

```bash
npx wrangler secret list --name member-site-template
# → [{ "name": "SUPABASE_SERVICE_ROLE_KEY", "type": "secret_text" }] が出れば OK
```

Turnstile (CAPTCHA) を有効化する場合は同様に `TURNSTILE_SECRET_KEY` を登録します。詳細手順は [.claude/deployment.md「Cloudflare Turnstile（任意 / bot 対策）」](.claude/deployment.md#cloudflare-turnstile任意--bot-対策) を参照。

> **⚠️ Cloudflare の Secret には 2 系統あります**
>
> Cloudflare には **per-Worker Secret**（従来方式）と **Secrets Store**（Open Beta、アカウント全体で共有）の 2 つがあり、Dashboard UI では別セクションに表示されます。このプロジェクトのコード（[src/lib/supabase-admin.ts](src/lib/supabase-admin.ts)）は `env.SUPABASE_SERVICE_ROLE_KEY` として**同期アクセス**しているため、**per-Worker Secret を使う必要があります**（Secrets Store は `await env.X.get()` の非同期アクセスになる）。
>
> Dashboard UI で登録する場合は、必ず **Settings > Variables and Secrets > Add** からタイプを「**Secret**」にしてください（「Bindings > Secrets Store」ではありません）。画面の見分けに自信がない場合は、上記の **CLI 経由が最も確実**です。
>
> 参考: [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) / [Secrets Store](https://developers.cloudflare.com/secrets-store/)

### 8. 本番公開値の供給（ビルド時 inline）

公開値（`PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY`）はコードから `import.meta.env.PUBLIC_*` で参照されており、**Vite が `astro build` の時点で `.env*` から読み取ってバンドルに inline します**（クライアント JS からも参照されるため）。供給経路を選びます。

(a) **同一 Supabase プロジェクトを開発と本番で使う場合**: Step 2 で作成した [.env](.env.example) の値がそのまま本番ビルドにも使われるため、追加作業は不要です。

(b) **本番だけ別 Supabase プロジェクトを使う場合**: ローカル機からデプロイするなら `.env.production` を作成して上書きします（Vite は production build 時に `.env` の上に `.env.production` を重ね読みします。`.env.production` は `.gitignore` 済）。

```bash
# .env.production
PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

CI からデプロイするならビルドコマンドに環境変数を直接渡す形でも可:

```bash
PUBLIC_SUPABASE_URL=... PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npm run deploy
```

> **`wrangler.jsonc` の `vars` には `PUBLIC_*` を書かないこと。** `vars` は Workers ランタイム env (`env.X` / `cloudflare:workers`) のみに反映され、`import.meta.env.PUBLIC_*` には届きません。書いても無害ですが効きません（コード側がそちらを参照していないため）。本テンプレートで `vars` 経由で読む値は現状ありません（秘密値は `wrangler secret`、公開値は `.env*`）。

### 9. 初回デプロイ

```bash
npm run deploy
# = wrangler types && astro build && wrangler deploy
```

デプロイ完了後、`https://member-site-template.<your-subdomain>.workers.dev` で公開されます。Worker 名は [wrangler.jsonc](wrangler.jsonc) の `name` で変更できます。

### 10. 動作確認と以降の更新

- Cloudflare Dashboard > Workers & Pages > 該当 Worker > Logs（`observability.enabled: true` により有効）で起動ログを確認します。
- 以降の更新は `git push` 後に `npm run deploy` を再実行します。

---

## デプロイ設定の要点

現在の [wrangler.jsonc](wrangler.jsonc) は Astro / Cloudflare 公式推奨に準拠しています。

- `main: "@astrojs/cloudflare/entrypoints/server"` — Astro 公式アダプターの統合エントリーポイント
- `assets.directory: "./dist"` / `assets.binding: "ASSETS"` — Workers Static Assets
- `compatibility_flags: ["nodejs_compat", ...]` — SSR で Node.js API を利用するため必須
- `observability.enabled: true` — Dashboard からログ閲覧

詳細な設計判断は [.claude/deployment.md](.claude/deployment.md) を参照してください。

---

## 関連ドキュメント

- [CLAUDE.md](CLAUDE.md) — プロジェクト概要
- [.claude/architecture.md](.claude/architecture.md) — アーキテクチャ・技術スタック
- [.claude/database.md](.claude/database.md) — DB スキーマ・RLS
- [.claude/security.md](.claude/security.md) — セキュリティチェックリスト
- [.claude/development.md](.claude/development.md) — 開発ルール・命名規則
- [.claude/deployment.md](.claude/deployment.md) — デプロイ詳細

---

## トラブルシューティング

| 症状                                 | 対処                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev` で型エラー             | `npm run generate-types`（= `wrangler types`）で `worker-configuration.d.ts` を再生成                                                                              |
| `wrangler deploy` で auth エラー     | `npx wrangler login` を再実行                                                                                                                                      |
| 本番で Service Role Key が undefined | まず `npx wrangler secret list --name member-site-template` で per-Worker Secret に登録されているか確認。空なら下記「Secret が登録したはずなのに undefined」を参照 |
| SSR でビルドエラー                   | `compatibility_flags` に `nodejs_compat` があるか確認                                                                                                              |

### Secret が登録したはずなのに undefined になる

Dashboard で登録したのに `env.SUPABASE_SERVICE_ROLE_KEY` が `undefined` になる場合、**Secrets Store** 側に登録されている可能性があります。

```bash
# per-Worker Secret を確認（このプロジェクトが使うべき方式）
npx wrangler secret list --name member-site-template

# Secrets Store を確認（別系統。ここに入っているとコード側の同期アクセスでは読めない）
npx wrangler secrets-store store list
npx wrangler secrets-store secret list <STORE-ID>
```

**per-Worker Secret が空で、Secrets Store 側に入っている場合**の復旧手順:

1. Dashboard で Secrets Store 側のバインディング／エントリを削除
2. per-Worker Secret として CLI 再登録:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template
   ```
3. `npx wrangler secret list --name member-site-template` で登録を確認
4. ブラウザで管理者画面をリロード（再デプロイ不要）

Dashboard UI は見た目が紛らわしいため、**Secret は CLI で登録・管理するのが確実**です。
