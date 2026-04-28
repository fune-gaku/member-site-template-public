# アーキテクチャ・技術スタック

## 技術スタック

| カテゴリ             | 技術                  | バージョン | 用途                                               |
| -------------------- | --------------------- | ---------- | -------------------------------------------------- |
| フレームワーク       | Astro                 | 6.x        | SSRフレームワーク（サーバーサイドレンダリング）    |
| アダプタ             | @astrojs/cloudflare   | 13.x       | Cloudflare Workers デプロイ                        |
| UIライブラリ         | Vue                   | 3.x        | Islands パターンでインタラクティブコンポーネント   |
| スタイリング         | Tailwind CSS          | 4.x        | ユーティリティファーストCSS（`@tailwindcss/vite`） |
| BaaS                 | Supabase              | 最新       | 認証・データベース・ストレージ                     |
| Supabase SDK         | @supabase/supabase-js | 2.x        | Supabase クライアント                              |
| Supabase SSR         | @supabase/ssr         | 最新       | SSR用の公式ヘルパー                                |
| バリデーション       | Zod（astro/zod）      | 最新       | スキーマバリデーション                             |
| ランタイム           | Cloudflare Workers    | -          | エッジランタイム                                   |
| パッケージマネージャ | npm                   | -          | 依存関係管理                                       |
| Node.js              | Node.js               | >=22.12.0  | 開発環境                                           |

---

## ディレクトリ構成

```
member-site-template/
├── CLAUDE.md                          # メインドキュメント（@import で security.md / development.md を常時ロード）
├── README.md                          # セットアップ・デプロイ手順
├── .claude/                           # Claude Code プロジェクト情報
│   ├── architecture.md                # 本ファイル：アーキテクチャ
│   ├── database.md                    # データベース設計
│   ├── deployment.md                  # デプロイ手順（必須項目のみ）
│   ├── deployment-optional.md         # 任意機能（opt-in）セットアップ：Google OAuth 等
│   ├── development.md                 # 開発ルール（@import で常時ロード）
│   ├── security.md                    # セキュリティガイドライン（@import で常時ロード）
│   ├── settings.json                  # Claude Code 共有設定（permission allowlist）
│   └── commands/
│       └── codex-cross-review.md      # /codex-cross-review : Codex × Claude Code 二人レビュー収束ループ
├── src/
│   ├── actions/
│   │   └── index.ts                   # Astro Actions（auth.* / posts.* / admin.*）
│   ├── components/
│   │   ├── SignupForm.vue             # サインアップフォーム
│   │   ├── LoginForm.vue              # ログインフォーム
│   │   ├── UpdatePasswordForm.vue     # パスワード更新（recovery / invite フロー）
│   │   ├── ProfileForm.vue            # プロフィール編集（アバター含む）
│   │   ├── PostForm.vue               # 投稿作成・編集（兼用）
│   │   ├── PostList.vue               # 投稿一覧（編集・削除アクション付き）
│   │   ├── InviteUserForm.vue         # 管理者：ユーザー招待
│   │   ├── AdminUserList.vue          # 管理者：ユーザー一覧と role 切替
│   │   └── AdminUsersPanel.vue        # 管理者：上 2 つのラッパー
│   ├── layouts/
│   │   ├── Base.astro                 # ベースレイアウト
│   │   ├── Auth.astro                 # 認証ページレイアウト
│   │   ├── Member.astro               # 会員ページレイアウト
│   │   └── Admin.astro                # 管理者ページレイアウト（admin 視覚的区別 + バッジ）
│   ├── lib/
│   │   ├── supabase.ts                # サーバー用 Supabase クライアント
│   │   ├── supabase-browser.ts        # ブラウザ用 Supabase クライアント
│   │   ├── supabase-admin.ts          # service_role（毎リクエスト生成、セッション漏洩防止）
│   │   ├── password-schema.ts         # パスワード Zod スキーマ（複雑性要件）
│   │   ├── pwned-password.ts          # HIBP k-Anonymity による漏洩パスワードチェック
│   │   ├── safe-redirect.ts           # Open Redirect 対策（next クエリのサニタイズ）
│   │   ├── security-headers.ts        # CSP / HSTS / X-Frame-Options 等の生成
│   │   └── avatar-upload.ts           # アバター用 MIME / size 制約 + ファイル名サニタイズ
│   ├── pages/
│   │   ├── index.astro                # ランディングページ
│   │   ├── auth/
│   │   │   ├── signup.astro           # サインアップ
│   │   │   ├── signin.astro           # サインイン
│   │   │   ├── signout.astro          # サインアウト（GET 405 / POST のみ受理）
│   │   │   ├── reset-password.astro   # パスワードリセット申請
│   │   │   ├── confirm.astro          # OTP ランディング（B 案、明示クリックで verify）
│   │   │   ├── update-password.astro  # 新パスワード入力（recovery セッション必須）
│   │   │   └── callback.astro         # PKCE 認証コールバック（互換維持）
│   │   ├── member/
│   │   │   ├── dashboard.astro        # ダッシュボード
│   │   │   ├── profile.astro          # プロフィール（SSR 事前取得）
│   │   │   └── data.astro             # 投稿 CRUD（SSR 事前取得 + Vue Islands）
│   │   └── admin/
│   │       └── users.astro            # 管理者：ユーザー一覧・招待・role 切替（admin role 必須）
│   ├── styles/
│   │   └── global.css                 # グローバルスタイル（Tailwind + @theme）
│   ├── env.d.ts                       # 環境変数・App.Locals 型定義（declare global + export {}）
│   └── middleware.ts                  # 認証 + role 取得 + セキュリティヘッダ付与
├── supabase/
│   ├── config.toml                    # Supabase CLI 設定（Issue #34、site_url / password requirements 等）
│   ├── .gitignore                     # supabase init 生成（.temp / .branches を除外）
│   └── migrations/
│       └── 20260420205000_init.sql    # 初期スキーマ + RLS + トリガー + Storage バケット
│                                      #   ファイル名は Supabase CLI 規約 (`supabase migration new <topic>` の自動採番)
│                                      #   reset / cleanup は `supabase db reset` で代替（旧 000_cleanup.sql は不要）
├── tests/
│   ├── README.md                      # テスト実行方法
│   ├── unit/                          # 単体（schema / middleware / supabase-client 等）
│   ├── integration/                   # Astro Container API による SSR 検証
│   ├── workers/                       # @cloudflare/vitest-pool-workers で実ランタイム検証
│   └── *.test.ts                      # ファイル単位（avatar-upload / safe-redirect / 他）
├── .githooks/
│   └── pre-commit                     # gitleaks（秘密情報のコミット防止）
├── .github/
│   ├── dependabot.yml                 # 依存 / GitHub Actions の週次更新
│   └── workflows/
│       └── npm-audit.yml              # PR + 週次の npm audit
├── .env.example                       # 公開環境変数テンプレート
├── .dev.vars.example                  # ローカルシークレットテンプレート
├── .gitignore
├── .nvmrc                             # Node.js バージョン（>=22.12.0）
├── .prettierrc.mjs / .prettierignore  # Prettier（prettier-plugin-tailwindcss でクラス整列）
├── astro.config.mjs                   # Astro 設定（cloudflare adapter / vue / tailwindcss）
├── eslint.config.js                   # ESLint Flat Config
├── package.json                       # 依存（overrides で vite / yaml を固定）
├── tsconfig.json                      # TypeScript strict
├── vitest.config.ts                   # unit / integration 用
├── vitest.workers.config.ts           # Workers 用
└── wrangler.jsonc                     # Cloudflare Workers 設定
```

---

## コンポーネント設計方針

### Astro Islands パターン

- **サーバーレンダリング優先**: ページ全体はAstroで静的にレンダリング
- **部分的なハイドレーション**: Vue コンポーネントは必要な箇所のみ `client:load` でマウント
- **パフォーマンス重視**: 不要なJavaScriptは送信しない

### Vue コンポーネント

- **小さく・単一責任**: 1コンポーネント = 1機能
- **Composition API**: `<script setup>` を使用
- **型安全**: TypeScript で実装
- **props/emit**: 親子間のデータフローを明示

---

## 状態管理

### クライアント側

- **ローカル状態**: Vue の `ref`/`reactive`
- **グローバル状態**: 最小限に抑える（必要に応じて Pinia など検討）

### サーバー側

- **Astro.locals**: ミドルウェアでユーザー情報を設定
- **Cookie**: Supabase の認証トークン管理

---

## 認証フロー

```
1. ユーザーがページにアクセス
   ↓
2. middleware.ts が実行される
   ↓
3. createClient() でサーバー用 Supabase クライアント生成
   ↓
4. supabase.auth.getUser() を呼び出し
   - トークンが期限切れの場合、自動リフレッシュ
   - 新しい Cookie が context.cookies.set() される
   ↓
5. Astro.locals.user にユーザー情報を設定
   ↓
6. /member/* の場合、未認証ならリダイレクト
   ↓
7. ページレンダリング
```

### 認証 Cookie の自動リフレッシュ

- `@supabase/ssr` の `createServerClient` が内部で管理
- `setAll` コールバックで `context.cookies.set()` を呼び出し
- Astro が自動的に `Set-Cookie` ヘッダーに反映（手動加工不要）

---

### メール経由の認証フロー（Issue #002 / #002-B）

Supabase のメール認証には **2 種類のトークン方式** があり、メールスキャナ（Gmail / Outlook / Microsoft Defender Safe Links / 企業 MTA の URL プレビュー等）の GET プリフェッチ耐性が異なる。本テンプレートでは公式推奨の「ランディングページ + 明示クリック（B 案）」パターンを採用し、両者を別エンドポイントに分離している。

| 方式                             | 代表的な発生源                                    | エンドポイント   | スキャナ耐性                | 備考                                                                      |
| -------------------------------- | ------------------------------------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------- |
| PKCE (`?code=...`)               | ブラウザ発の signup (`supabase.auth.signUp`)      | `/auth/callback` | ✅ あり                     | code_verifier がブラウザ側に残るため、GET で消費されても安全              |
| OTP (`?token_hash=...&type=...`) | admin invite / password reset / confirm signup 等 | `/auth/confirm`  | ❌ なし（単独）→ B 案で解消 | GET でプリフェッチされると OTP が消費されるため、明示的 POST を必須にする |

#### `/auth/confirm` フロー（OTP 方式、Issue #002）

```
1. メールテンプレートのリンクに {{ .TokenHash }} と type をクエリとして埋め込む
   例: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password
   ↓
2. ユーザー（またはスキャナ）がリンクを GET → /auth/confirm は hidden input に
   token_hash と type を詰めた「続行」ボタンを表示するのみ（verify しない）
   ↓
3. ユーザーが「続行」を明示的にクリック → フォーム POST
   ↓
4. auth.confirmOtp Action が supabase.auth.verifyOtp({ token_hash, type }) を実行
   ↓
5. 成功時に type に応じて分岐リダイレクト:
   - recovery → /auth/update-password
   - invite   → /auth/update-password?mode=invite
   - その他   → safeNextPath(next) または /member/dashboard
   失敗時 → /auth/signin?error=confirm_failed
```

`next` クエリは `src/lib/safe-redirect.ts` の `safeNextPath` で必ずサニタイズし、Open Redirect (CWE-601) を防ぐ。

#### `/auth/update-password` フロー（Issue #002-B）

`verifyOtp` 成功で確立された **recovery 一時セッション** を使って `supabase.auth.updateUser({ password })` を呼ぶ。

```
1. /auth/update-password ページロード時に supabase.auth.getUser() で recovery セッション確認
   - 無ければ /auth/signin?error=recovery_session_required にリダイレクト
   ↓
2. UpdatePasswordForm.vue で新パスワードを入力
   - Zod passwordSchema（8 文字 + 英大小 + 数字、72 文字以下）
   - 任意で HIBP 漏洩チェック（ENABLE_HIBP_CHECK=true のとき）
   ↓
3. auth.updatePassword Action が supabase.auth.updateUser({ password }) を実行
   ↓
4. 成功直後に supabase.auth.signOut() で recovery セッションを即切り
   （OWASP Forgot Password Cheat Sheet 推奨: 更新後の強制再ログイン）
   ↓
5. /auth/signin?reset=done に遷移し、新パスワードでの再ログインを促す
```

#### ログイン中ユーザーによるパスワード変更フロー（Issue #19）

recovery 用 `/auth/update-password` とは別経路。プロフィール画面 (`/member/profile`) の `ChangePasswordForm.vue` から呼ぶ `auth.changePassword` Action が担当する。設計差分:

- 現在のパスワードによる **再認証 (`signInWithPassword`)** を要求してから `updateUser` を呼ぶ。盗難セッション Cookie 単独 / 共有 PC 攻撃での account takeover を抑止 (OWASP Authentication Cheat Sheet / NIST SP 800-63B §5.2.10)
- 成功後の `signOut` は **行わない**（recovery と異なり、本人による日常変更では現セッションを維持したいため）
- `currentPassword === newPassword` を拒否（運用上の利便性 + ポリシーローテーション意図の明示）
- HIBP 漏洩チェック (`ENABLE_HIBP_CHECK=true` 時) を再認証より前に実行し、Auth サーバラウンドトリップを最小化

実装本体は `src/lib/auth-change-password.ts` の `performChangePassword` に分離してテスト可能 (`tests/unit/auth-change-password.test.ts`)。

#### `/auth/callback` フロー（PKCE 専用、互換維持）

- `?code=...` 付きで来れば `exchangeCodeForSession(code)` を自動実行（PKCE 耐性あり）
- 互換: 旧形式の `?token_hash=...&type=...` が来た場合は `/auth/confirm` に内部リダイレクト

#### Supabase Dashboard 側のメールテンプレート

**すべてのメールで `{{ .ConfirmationURL }}` は禁止**。必ず `{{ .TokenHash }}` ベースで `/auth/confirm` を経由させる。具体的な文字列は [.claude/deployment.md「Supabase Auth: Email Templates」](./deployment.md#supabase-auth-email-templates必須--issue-002--002-b) 節を参照。

---

## データフロー

### サーバーサイド（.astro ファイル）

```typescript
// ページコンポーネント内
const supabase = createClient({
  request: Astro.request,
  cookies: Astro.cookies,
});
const { data } = await supabase.from("profiles").select("*");
```

### クライアントサイド（.vue ファイル）

```typescript
// Vue コンポーネント内
import { createBrowserSupabase } from "@/lib/supabase-browser";
const supabase = createBrowserSupabase();
const { data } = await supabase.from("profiles").select("*");
```

### Astro Actions

```typescript
// actions/index.ts
import { actions } from "astro:actions";
await actions.auth.signIn({ email, password });
```

---

## UIデザイン方針

### カラーパレット

| 用途          | カラーコード | CSS変数             |
| ------------- | ------------ | ------------------- |
| Brand Primary | `#0c8ee8`    | `--color-brand-500` |
| Brand Dark    | `#0058a1`    | `--color-brand-700` |
| Brand Light   | `#f0f7ff`    | `--color-brand-50`  |
| Text          | `#111827`    | `text-gray-900`     |
| Background    | `#ffffff`    | `bg-white`          |

### タイポグラフィ

- **フォント**: DM Sans (sans-serif), JetBrains Mono (monospace)
- **サイズ**: Tailwind のデフォルトスケール使用
- **行間**: `leading-relaxed` など適切な spacing

### レスポンシブ

- **モバイルファースト**: 基本はスマートフォン向けデザイン
- **ブレークポイント**: Tailwind CSS のデフォルト（sm, md, lg, xl, 2xl）
- **タッチフレンドリー**: ボタンは最低 44px × 44px

---

## パフォーマンス方針

1. **Astro Islands**: 必要最小限の JavaScript のみ配信
2. **画像最適化**: Astro の `<Image>` コンポーネント使用（`imageService: "compile"`）
3. **CSS**: Tailwind CSS の Purge 機能で未使用スタイル削除
4. **Edge デプロイ**: Cloudflare Workers でグローバルに配信
5. **キャッシング**: 静的アセットは CDN キャッシュ

---

## アクセシビリティ

- **セマンティック HTML**: `<button>`, `<nav>`, `<main>` など適切なタグ使用
- **ARIA ラベル**: 必要に応じて `aria-label` 付与
- **キーボード操作**: Tab キー、Enter キーで操作可能に
- **コントラスト**: WCAG AA 基準を満たす色のコントラスト
- **フォーカス表示**: `:focus-visible` でアウトライン表示
