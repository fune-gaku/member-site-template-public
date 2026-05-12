# 開発ルール・コーディング規約

## コーディング規約

### TypeScript

- `tsconfig.json` の `strict: true` 前提。`any` を使わず、不明な値には `unknown` を使ってナローイングする
- 関数の引数・戻り値・公開エクスポートには明示的な型注釈を付ける（型推論に任せるのは局所変数・コールバック内まで）
- 型のみのインポートは `import type { Foo } from "..."` を使う（バンドルサイズ削減・副作用ゼロ）
- 環境変数アクセスは用途で使い分ける: 公開値は `import.meta.env.PUBLIC_*`、サーバー秘密値は `cloudflare:workers` 経由（[security.md「環境変数の扱い」](./security.md#環境変数の扱い)）
- `Cloudflare.Env` / `App.Locals` に新しい変数・プロパティを追加するときは `src/env.d.ts` を更新する

---

### Vue 3

- 単一ファイルコンポーネント（`.vue`）は **`<script setup lang="ts">` 必須**。Options API は禁止
- Composition API（`ref` / `reactive` / `computed` / `watch`）を使う
- `defineProps<{...}>()` / `defineEmits<{...}>()` で型注釈を明示
- 親子間のデータ受け渡しは props down / events up を徹底（直接の双方向束縛は避ける）
- DOM への直接書き込み（`v-html`）は **禁止**（XSS リスク。[security.md「ユーザー入力のエスケープ」](./security.md#ユーザー入力のエスケープ) 参照）
- 1 コンポーネント = 1 関心事を原則とする（責務が分かれたら分割）

---

### CSS（Tailwind CSS v4）

- ユーティリティファースト。カスタム CSS は `src/styles/global.css` にまとめ、必要最小限にとどめる
- ブランドカラーは `@theme` ブロックで CSS 変数として定義（`--color-brand-{50,500,700}` 等）し、`text-brand-700` のようにクラスから利用する
- クラス順序は `prettier-plugin-tailwindcss` が自動整列するため `npm run format` を信頼する（手動整列しない）
- `@apply` は局所的かつ繰り返しが多いユーティリティ束ねにのみ使う（多用するとユーティリティファーストの旨味が消える）
- `@astrojs/tailwind` は使わない。`@tailwindcss/vite` プラグインのみで運用する

---

## 命名規則

### ファイル名

| 種類                       | 命名規則                                                                                     | 例                                        |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Vue コンポーネント         | `PascalCase.vue`                                                                             | `ProfileForm.vue` / `PostList.vue`        |
| Astro レイアウト           | `PascalCase.astro`                                                                           | `Member.astro` / `Admin.astro`            |
| Astro ページ               | `kebab-case.astro`                                                                           | `signin.astro` / `update-password.astro`  |
| TS モジュール（lib・util） | `kebab-case.ts`                                                                              | `safe-redirect.ts` / `password-schema.ts` |
| 型定義のみ                 | `*.d.ts`                                                                                     | `env.d.ts`                                |
| テスト                     | `<topic>.test.ts`                                                                            | `actions-schema.test.ts`                  |
| マイグレーション           | `<14桁タイムスタンプ>_<topic>.sql`（`supabase migration new <topic>` で自動採番、Issue #34） | `20260420205000_init.sql`                 |

### 変数・関数

| 種類                   | 命名規則                         | 例                                             |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| 変数・関数             | `camelCase`                      | `displayName` / `createBrowserSupabase()`      |
| モジュールレベル定数   | `UPPER_SNAKE_CASE`               | `MAX_AVATAR_SIZE`                              |
| 型・インターフェース   | `PascalCase`                     | `Profile` / `MemberPost`                       |
| Vue コンポーネント本体 | `PascalCase`（ファイル名と一致） | `ProfileForm`                                  |
| Action 名前空間        | `camelCase`（短く）              | `actions.auth.signIn` / `actions.posts.create` |

### データベース

| 種類           | 命名規則                                                                                                 | 例                               |
| -------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| テーブル       | `snake_case`（複数形）                                                                                   | `profiles` / `member_posts`      |
| カラム         | `snake_case`                                                                                             | `display_name` / `created_at`    |
| 主キー         | `id` 単独カラム（型は `uuid`、`gen_random_uuid()` デフォルト）または対象テーブル名と紐付く `<entity>_id` | `profiles.user_id`               |
| 外部キー       | `<対象>_id`                                                                                              | `member_posts.user_id`           |
| RLS ポリシー名 | `"Users can <verb> own <noun>"`                                                                          | `"Users can update own profile"` |
| トリガー関数   | `snake_case`（動詞句）                                                                                   | `handle_new_user()`              |

---

## ディレクトリ・ファイル構成ルール

レイアウト・コンポーネント・ライブラリ・ページ・マイグレーション等のディレクトリ責務は [architecture.md「ディレクトリ構成」](./architecture.md#ディレクトリ構成) に定義。新規ファイルを作る前に該当セクションを `Read` で確認する。

---

## ESLint 構成

[eslint.config.js](../eslint.config.js) はハイブリッド構成（Issue #38 で確立）。AI が書いたコードに多発する Promise 誤用・`any` 流入・無意味な条件分岐を機械的に拾うため、構文ベース層に **`.ts` 限定の typed lint** と **横方向の sonarjs / security** を重ねている。

### 構造（読む順）

1. **基本層** — `eslint.configs.recommended` + `tseslint.configs.strict` + `stylistic`（型情報なし、全ファイル適用）
2. **横方向** — `sonarjs/recommended` + `security/recommended`（複雑度・bad smell・基本的セキュリティ tripwire）
3. **フレームワーク** — `astro.configs.recommended` + `astro.configs["jsx-a11y-strict"]` + `vue.configs["flat/recommended"]`
4. **typed lint（`.ts` / `.tsx` / `.mts` / `.cts` 限定）** — `tseslint.configs.strictTypeCheckedOnly` + `stylisticTypeCheckedOnly`（`Only` 版でベースの strict / stylistic と二重スタック回避）。`.vue` / `.astro` は `disableTypeChecked` で除外し、型検査は `astro check` / `vue-tsc` に委ねる
5. **Prettier** — `eslint-config-prettier` を **必ず最後** に配置

### `.vue` / `.astro` に typed lint を当てない理由

公式 [`typescript-eslint` performance docs](https://typescript-eslint.io/troubleshooting/typed-linting/performance) が `extraFileExtensions` + `projectService` の組合せに対してパフォーマンス劣化を警告している。本リポは `astro check` / `vue-tsc` が型検査を担っているため、ESLint 側で重ねる費用対効果が低い。

### 手動ルール 3 階層

| 階層                           | 意図                                                | 代表例                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **error**（バグ直結）          | AI 生成バグの早期検出に直結。違反 0 件で error 維持 | `@typescript-eslint/no-floating-promises` / `no-misused-promises` / `no-base-to-string` / `require-await` / `no-unsafe-*`（argument / assignment / call / member-access / return）/ `no-explicit-any` / `no-non-null-assertion` / `consistent-type-imports` / `import/order` / `eqeqeq` / `no-shadow` / `no-throw-literal` |
| **warn**（段階導入）           | 既存違反 100+ 件のクラス。Sub Issue で段階格上げ    | `@typescript-eslint/no-deprecated` / `no-unnecessary-condition` / `restrict-template-expressions` / `method-signature-style` / `complexity` / `max-depth` / `id-length` 等のスタイル系                                                                                                                                     |
| **off**（FP 多発・重複・重い） | Step 1 試走の個別評価結果                           | `sonarjs/deprecation`（`@typescript-eslint/no-deprecated` と重複）/ `sonarjs/no-hardcoded-passwords`（変数名パターンマッチで FP）/ `security/detect-object-injection`（動的キーアクセスを一律警告）/ `import/no-cycle`（TIMING=1 で全体時間の 85% を消費）                                                                 |

詳細な off 判断の根拠は [eslint.config.js](../eslint.config.js) のコメントを参照（Step 1 試走の実測値を記録）。

### CI ベースライン

`npm run lint` は `eslint . --max-warnings <baseline>` で実行する。**新規に warning を増やすと CI が fail** する仕組み。既存 warn は Sub Issue（typed lint クラスごとに分割）で段階解消し、ベースラインを減らしていく。最終的に `--max-warnings 0` まで持っていく。

現在の baseline は [package.json](../package.json) の `lint` スクリプトで管理（Issue #38 リリース時 151 → #56 で 147）。

### `eslint-disable` 運用ルール

- `eslint-disable-next-line <rule> -- <理由>` を必ず使う（`--` の後に理由を書く）
- 理由には「なぜ disable してよいか」を **具体的な事実** で書く（"this is fine" は不可、"入力は basename で長さ上限あり、catastrophic backtracking のリスクなし" のように検証可能な事実）
- `linterOptions.reportUnusedDisableDirectives: "error"` で **未使用 disable を CI 検出**。disable が不要になったら即座に削除されることを強制
- ブロック単位の disable（`/* eslint-disable */` ... `/* eslint-enable */`）は緊急時のみ。常用しない

---

## コメント規約

- **デフォルトはコメントを書かない**。識別子と型で意図が伝わるなら不要
- 書くのは「なぜそうしたか（Why）」が非自明な場合のみ:
  - 仕様外の制約（外部サービスのバグ回避・互換性のための例外処理）
  - サブトルなインバリアント（呼び出し順依存・並行性前提・順序保証）
  - 一見冗長に見えるが意図的に残してある処理
- 「何をやっているか（What）」はコードを読めば分かるので書かない。呼び出し元名・チケット番号・ファイル名の繰り返しは PR 説明・コミット本文・`git blame` に任せる
- 削除済みコードを `// 削除: ...` のように残さない（git 履歴で追える）

---

## エラーハンドリング

### 原則

- すべての非同期処理は `try/catch` で囲み、握りつぶさない
- ログ用には `console.error("<context>:", error)` で文脈を残す（Workers Logs / Dashboard で確認できる）
- ユーザー向け文言は内部実装を漏らさない、フレンドリーで具体的な短文にする（例: 「プロフィールの登録に失敗しました。もう一度お試しください。」）
- DB / 外部 API のエラー文字列をそのまま `alert()` や UI 文言に流さない（情報漏洩・XSS リスク）
- Astro Action からは `ActionError`（`code` を `UNAUTHORIZED` / `BAD_REQUEST` / `INTERNAL_SERVER_ERROR` 等の Astro 既定値に揃える）で投げる

### 実装例

```typescript
import { defineAction, ActionError } from "astro:actions";
import { profileSchema } from "@/lib/password-schema";
import { createClient } from "@/lib/supabase";

export const updateProfile = defineAction({
  input: profileSchema,
  handler: async (input, context) => {
    const supabase = createClient({
      request: context.request,
      cookies: context.cookies,
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new ActionError({ code: "UNAUTHORIZED" });
    }

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: input.displayName })
        .eq("user_id", user.id);
      if (error) throw error;
      return { ok: true };
    } catch (error) {
      console.error("updateProfile failed:", error);
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "プロフィールの更新に失敗しました。もう一度お試しください。",
      });
    }
  },
});
```

---

## バリデーション

### フロントエンド

`src/lib/password-schema.ts` のように **Zod スキーマをライブラリ化** し、Vue コンポーネントとサーバー側 Action の両方から再利用する。

```typescript
import { z } from "astro/zod";

export const profileSchema = z.object({
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
});

// Vue 側（UX 用：早期に弾く）
const result = profileSchema.safeParse({ displayName: input.value });
if (!result.success) {
  errorMessage.value = result.error.issues[0].message;
  return;
}
```

### バックエンド

Astro Action の `input` に **同じ Zod スキーマ** を渡す。フロント検証は UX のための早期エラー、**バックエンド検証が真の防衛線**（DevTools / curl で迂回されても安全になるように）。ファイルアップロードに関する追加の多層防御（バケット側 `allowed_mime_types` + Action 側 `.refine()` + クライアント `accept`）は [security-ops.md「ファイルアップロードのガイドライン」](./security-ops.md#ファイルアップロードのガイドライン) を参照。

---

## Git・コミットルール

### ブランチ戦略

`main` は常にデプロイ可能な状態を保ち、変更は **作業単位の feature ブランチ** で行う。

```
main (本番ブランチ、常にデプロイ可能)
  ├── feat/<short-topic>     (新機能)
  ├── fix/<short-topic>      (バグ修正)
  ├── chore/<short-topic>    (運用・依存・ドキュメント)
  └── security/<issue-id>    (セキュリティ Issue 対応)
```

**作業フロー**:

```bash
# 1. 着手時: ブランチ作成
git checkout main
git pull origin main
git checkout -b feat/<short-topic>

# 2. 実装中: こまめにコミット（コミット本文に Why を残す）
git add <files>
git commit -m "feat: ..."

# 3. 完了時: main にマージ（履歴をたどりやすく --no-ff を推奨）
git checkout main
git merge feat/<short-topic> --no-ff
git push origin main

# 4. 不要ブランチを削除
git branch -d feat/<short-topic>
```

**ルール**:

- 作業前に必ずブランチを作成（`main` への直接コミットは禁止）
- 1 ブランチ = 1 関心事（機能 / バグ修正 / 依存更新 を混ぜない）
- マージは `--no-ff` で意図的にマージコミットを残す（後から作業単位で振り返れる）
- ブランチ名は `<type>/<short-topic>` 形式で、`type` は `feat` / `fix` / `refactor` / `chore` / `security` / `docs` から選ぶ

### コミットメッセージ

**フォーマット**:

```
<type>: <subject>

<body>（オプション）

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**type**:

- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `style`: スタイル変更
- `docs`: ドキュメント
- `chore`: その他

---

## テスト方針

- フレームワーク: **Vitest 4**
- 構成は 3 種類:
  - `tests/unit/` — 純関数・Zod スキーマ・middleware・supabase クライアント等の単体テスト
  - `tests/integration/` — Astro Container API でページ・コンポーネントをレンダリングし、SSR 出力を検証
  - `tests/workers/` — `@cloudflare/vitest-pool-workers` で実 Workers ランタイム上の挙動（環境変数・Bindings 等）を検証
- 設定ファイル: `vitest.config.ts`（unit / integration）と `vitest.workers.config.ts`（Workers）の 2 系統
- 新規 Action / コンポーネント / 関数を追加するときは、対応する `tests/unit/<topic>.test.ts` を最低 1 ファイル以上同時に追加する
- `npm run test` で両系統が一括実行される

### 影響確認（マージ後・依存更新後）の進め方

依存更新（Dependabot 等）や大きな変更のマージ後に「動作確認プラン」を立てるときは、**手順に curl や手動操作を書く前に必ず `tests/` を grep** して既存カバレッジを確認する。

- 既存テストが網羅していれば `npm test` の green = その観点は維持されている、と判断して**手動検証は省略**
- カバーされていない観点だけを手動検証プランに残す
- ギャップが見つかったら、手動検証で済ませず **テスト追加 Issue を切る**（手動検証は再発防止にならない）

例: security headers は [tests/security-headers.test.ts](../tests/security-headers.test.ts)、`/member` `/admin` 配下の認可は [tests/unit/middleware.test.ts](../tests/unit/middleware.test.ts)、`/auth/signout` の GET/HEAD/PUT/DELETE/PATCH 405 ガードは [tests/integration/signout-csrf.test.ts](../tests/integration/signout-csrf.test.ts)、CSRF cross-origin POST 403 は [tests/workers/csrf.test.ts](../tests/workers/csrf.test.ts) でそれぞれカバー済み。これらの観点はすべて `npm test` で検証されるので、curl での再確認は冗長。

---

## パフォーマンス

[architecture.md「パフォーマンス方針」](./architecture.md#パフォーマンス方針) を参照。Astro Islands による最小 JS 配信、`<Image>` による画像最適化、Tailwind の Purge、Cloudflare の Edge 配信が骨子。

---

## アクセシビリティ

[architecture.md「アクセシビリティ」](./architecture.md#アクセシビリティ) を参照。セマンティック HTML / ARIA / キーボード操作 / WCAG AA コントラスト / `:focus-visible` が骨子。`eslint-plugin-jsx-a11y` で機械的に検査される。

---

## IDE 設定推奨

### VS Code 拡張機能

推奨拡張は [.vscode/extensions.json](../.vscode/extensions.json) に列挙。クローン後 VS Code を開くと「推奨拡張をインストールしますか？」のプロンプトが出るので承認する。
