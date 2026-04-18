# アーキテクチャ・技術スタック

## 技術スタック

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| フレームワーク | Astro | 6.x | SSRフレームワーク（サーバーサイドレンダリング） |
| アダプタ | @astrojs/cloudflare | 13.x | Cloudflare Workers デプロイ |
| UIライブラリ | Vue | 3.x | Islands パターンでインタラクティブコンポーネント |
| スタイリング | Tailwind CSS | 4.x | ユーティリティファーストCSS（`@tailwindcss/vite`） |
| BaaS | Supabase | 最新 | 認証・データベース・ストレージ |
| Supabase SDK | @supabase/supabase-js | 2.x | Supabase クライアント |
| Supabase SSR | @supabase/ssr | 最新 | SSR用の公式ヘルパー |
| バリデーション | Zod（astro/zod） | 最新 | スキーマバリデーション |
| ランタイム | Cloudflare Workers | - | エッジランタイム |
| パッケージマネージャ | npm | - | 依存関係管理 |
| Node.js | Node.js | >=22.12.0 | 開発環境 |

---

## ディレクトリ構成

```
member-site-template/
├── .claude/                    # Claude Code プロジェクト情報
│   ├── CLAUDE.md              # メインドキュメント
│   ├── architecture.md        # アーキテクチャ
│   ├── database.md            # データベース設計
│   ├── security.md            # セキュリティガイドライン
│   ├── development.md         # 開発ルール
│   ├── deployment.md          # デプロイ手順
│   └── phases/                # Phase別記録
│       └── current.md         # 現在のPhase
├── src/
│   ├── actions/
│   │   └── index.ts           # Astro Actions（認証・ストレージ・管理）
│   ├── components/
│   │   ├── SignupForm.vue     # サインアップフォーム
│   │   ├── LoginForm.vue      # ログインフォーム
│   │   ├── ProfileForm.vue    # プロフィール編集（アバター含む）
│   │   └── SampleDataTable.vue # サンプルデータ表示
│   ├── layouts/
│   │   ├── Base.astro         # ベースレイアウト
│   │   ├── Auth.astro         # 認証ページレイアウト
│   │   └── Member.astro       # 会員ページレイアウト
│   ├── lib/
│   │   ├── supabase.ts        # サーバー用Supabaseクライアント
│   │   ├── supabase-browser.ts # ブラウザ用Supabaseクライアント
│   │   └── supabase-admin.ts  # Admin用Supabaseクライアント
│   ├── pages/
│   │   ├── index.astro        # ランディングページ
│   │   ├── auth/
│   │   │   ├── signup.astro   # サインアップ
│   │   │   ├── signin.astro   # サインイン
│   │   │   ├── signout.astro  # サインアウト
│   │   │   ├── reset-password.astro # パスワードリセット
│   │   │   └── callback.astro # 認証コールバック
│   │   └── member/
│   │       ├── dashboard.astro # ダッシュボード
│   │       ├── profile.astro  # プロフィール
│   │       └── data.astro     # データ表示
│   ├── styles/
│   │   └── global.css         # グローバルスタイル（Tailwind + @theme）
│   ├── env.d.ts               # 環境変数型定義
│   └── middleware.ts          # 認証ミドルウェア
├── supabase/
│   └── migrations/
│       └── 001_init.sql       # 初期マイグレーション
├── .env.example               # 環境変数テンプレート
├── .dev.vars.example          # ローカルシークレットテンプレート
├── .nvmrc                     # Node.jsバージョン指定
├── astro.config.mjs           # Astro設定
├── wrangler.jsonc             # Cloudflare Workers設定
├── package.json               # 依存関係
└── tsconfig.json              # TypeScript設定
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

## データフロー

### サーバーサイド（.astro ファイル）

```typescript
// ページコンポーネント内
const supabase = createClient({
  request: Astro.request,
  cookies: Astro.cookies,
});
const { data } = await supabase.from('profiles').select('*');
```

### クライアントサイド（.vue ファイル）

```typescript
// Vue コンポーネント内
import { createBrowserSupabase } from '@/lib/supabase-browser';
const supabase = createBrowserSupabase();
const { data } = await supabase.from('profiles').select('*');
```

### Astro Actions

```typescript
// actions/index.ts
import { actions } from 'astro:actions';
await actions.auth.signIn({ email, password });
```

---

## UIデザイン方針

### カラーパレット

| 用途 | カラーコード | CSS変数 |
|------|-------------|---------|
| Brand Primary | `#0c8ee8` | `--color-brand-500` |
| Brand Dark | `#0058a1` | `--color-brand-700` |
| Brand Light | `#f0f7ff` | `--color-brand-50` |
| Text | `#111827` | `text-gray-900` |
| Background | `#ffffff` | `bg-white` |

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
