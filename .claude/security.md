# セキュリティガイドライン

## 概要

このドキュメントでは、会員サイトテンプレート開発時のセキュリティ方針とチェックリストを定義します。

**重要**: **コミット前に必ずセキュリティチェックリストを確認**してください。

---

## セキュリティチェックリスト

### ✅ 認証・認可

- [x] 環境変数（API Key、Secret）がハードコードされていない
- [x] `.env`ファイルが`.gitignore`に含まれている
- [x] `.dev.vars`ファイルが`.gitignore`に含まれている
- [x] `.env.example`には実際の値が含まれていない
- [x] 認証ミドルウェアが全ページに適用されている（`src/middleware.ts`）
- [x] Supabase RLSが適切に設定されている（全テーブル有効化）
- [x] セッショントークン（Cookie）が適切に管理されている（`@supabase/ssr`）
- [x] ログアウト処理でトークンが削除されている
- [x] `/member/*` 配下は認証必須（未認証時リダイレクト）
- [x] `SUPABASE_SERVICE_ROLE_KEY` はサーバーのみで使用
- [x] Admin クライアントは毎リクエスト生成（セッション漏洩防止）

### ✅ インジェクション対策

- [x] SQLクエリでユーザー入力を直接連結していない（Supabaseクライアント使用）
- [x] XSS対策：ユーザー入力をエスケープしている（Vue自動エスケープ）
- [x] コマンドインジェクション対策：シェルコマンドにユーザー入力を使用していない
- [x] HTMLインジェクション対策：`v-html`を使用していない

### ✅ データ検証

- [x] フォーム入力のバリデーション（フロントエンド：Vue、バックエンド：Zod）
- [x] ファイルアップロード：拡張子・MIMEタイプ・サイズ制限（5MB）
- [x] 数値入力：型チェック・範囲チェック（Zod）
- [x] 必須項目チェック（Zod）

### ✅ 情報漏洩対策

- [x] エラーメッセージで内部情報を表示していない（ユーザーフレンドリーなメッセージ）
- [x] デバッグログに機密情報を出力していない
- [x] APIレスポンスに不要なデータが含まれていない
- [x] コメントに機密情報が含まれていない

### ✅ アクセス制御

- [x] 他ユーザーのデータにアクセスできない（RLS で制御）
- [x] 管理者のみアクセス可能な機能が保護されている（role チェック）
- [x] ファイルストレージのアクセス制御が適切（Storage RLS）
- [x] APIエンドポイント（Astro Actions）が認証を要求している
- [x] 権限昇格攻撃を防止（`revoke update (role)` でカラムレベル権限制御）

### ✅ その他

- [ ] 依存パッケージに既知の脆弱性がない（`npm audit`）
- [ ] CORS設定が適切（Cloudflare Workers が自動管理）
- [ ] HTTPS強制（Cloudflare Workers が自動管理）
- [x] セキュアなCookie設定（`@supabase/ssr` が自動管理）

---

## 脅威モデル

### 想定する脅威

| 脅威                     | リスクレベル | 対策                                                      |
| ------------------------ | ------------ | --------------------------------------------------------- |
| 環境変数の漏洩           | 高           | `.gitignore`、コードレビュー                              |
| 権限昇格攻撃             | 高           | `revoke update (role)` でカラムレベル権限制御             |
| XSS攻撃                  | 中           | Vue自動エスケープ、`v-html`禁止                           |
| SQLインジェクション      | 中           | Supabaseクライアント使用（パラメータ化クエリ）            |
| 不正ファイルアップロード | 中           | 拡張子・MIME・サイズ制限（5MB）                           |
| セッションハイジャック   | 中           | Secure Cookie、HTTPS、トークン自動リフレッシュ            |
| CSRF攻撃                 | 低           | SameSite Cookie（`@supabase/ssr` が自動管理）             |
| RLS バイパス             | 高           | RLS を全テーブルで有効化、service_role キーはサーバーのみ |

---

## Phase 1 で実装したセキュリティ対策

### 1. RLS（Row Level Security）の完全実装

**全テーブルで RLS を有効化**:

- `profiles`: 自分のプロフィールのみ閲覧・更新可能
- `member_posts`: 自分の投稿のみ CRUD 可能
- Storage `avatars`: 自分のフォルダのみアクセス可能

```sql
alter table public.profiles enable row level security;
alter table public.member_posts enable row level security;
```

### 2. 権限昇格攻撃（Privilege Escalation）の防止

**カラムレベル権限で `role` 列を保護**:

```sql
revoke update (role) on public.profiles from authenticated;
```

一般ユーザーは自分の `role` を変更できない。カラムレベル権限は RLS より先に評価されるため、確実に防御できる。

### 3. Admin クライアントのセキュアな実装

**毎リクエスト新規生成**:

```typescript
export function createAdminClient() {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set...");
  }
  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
```

モジュールスコープで初期化しない（Supabase 公式がリクエスト間のセッション漏洩防止のため明示的に禁止）。

### 4. 認証ミドルウェアによる全体保護

**全ページでトークン自動リフレッシュ**:

```typescript
export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.user = user;

  if (context.url.pathname.startsWith("/member") && !user) {
    return context.redirect(
      `/auth/signin?next=${encodeURIComponent(context.url.pathname)}`,
    );
  }

  return next();
});
```

### 5. トリガーのセキュリティ

**`security definer` と `set search_path`**:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;
```

---

## コーディングルール（セキュリティ）

### 環境変数の扱い

**❌ 悪い例**:

```typescript
const supabaseUrl = "https://xxx.supabase.co"; // ハードコード
const apiKey = "eyJ..."; // ハードコード
```

**✅ 良い例（公開値）**:

```typescript
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const apiKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !apiKey) {
  throw new Error("環境変数が設定されていません");
}
```

**✅ 良い例（秘密値・サーバーのみ）**:

```typescript
import { env } from "cloudflare:workers";

const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}
```

---

### ユーザー入力のエスケープ

**❌ 悪い例**:

```vue
<div v-html="userInput"></div>
<!-- XSSリスク -->
```

**✅ 良い例**:

```vue
<div>{{ userInput }}</div>
<!-- Vue自動エスケープ -->
```

---

### SQLクエリ

**❌ 悪い例**:

```typescript
// 生SQLで直接入力を連結（Supabaseでは不可能だが、念のため）
const query = `SELECT * FROM profiles WHERE user_id = '${userInput}'`;
```

**✅ 良い例**:

```typescript
// Supabaseクライアントを使用（パラメータ化クエリ）
const { data } = await supabase
  .from("profiles")
  .select("*")
  .eq("user_id", userId);
```

---

### ファイルアップロード

**✅ 実装例（ProfileForm.vue）**:

```typescript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function handleAvatarChange(event: Event) {
  const file = target.files?.[0];
  if (!file) return;

  // サイズチェック
  if (file.size > MAX_FILE_SIZE) {
    error.value = "ファイルサイズは5MB以下にしてください";
    return;
  }

  // 画像形式チェック
  if (!file.type.startsWith("image/")) {
    error.value = "画像ファイルを選択してください";
    return;
  }

  // アップロード処理...
}
```

---

### エラーハンドリング

**❌ 悪い例**:

```typescript
try {
  await supabase.from("profiles").insert(data);
} catch (error) {
  alert(error.message); // 内部エラーがユーザーに表示される
}
```

**✅ 良い例**:

```typescript
try {
  await supabase.from("profiles").insert(data);
} catch (error) {
  console.error("プロフィール登録エラー:", error);
  alert("プロフィールの登録に失敗しました。もう一度お試しください。");
}
```

---

## Supabase セキュリティ設定

### Row Level Security（RLS）

**Phase 1 で実装済み**:

```sql
-- profiles テーブル
alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id);

-- role 列の権限昇格攻撃を防止
revoke update (role) on public.profiles from authenticated;
```

### Storage セキュリティポリシー

**avatars バケット（実装済み）**:

```sql
create policy "Users can view own avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "Users can upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);
```

---

## npm audit

定期的に脆弱性チェックを実行：

```bash
npm audit

# 自動修正
npm audit fix

# 重大な脆弱性のみ表示
npm audit --audit-level=high
```

---

## HTTPS・Cookie設定

### Cloudflare Workers

Cloudflare Workers は自動的に HTTPS を強制。

### Cookie設定

`@supabase/ssr` が自動的に Secure Cookie を管理。手動設定は不要。

```typescript
// createServerClient 内で自動的に設定される
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) =>
    cookies.set(name, value, options),
  );
}
```

Astro の `context.cookies.set()` が自動的に `Set-Cookie` ヘッダーに反映。

---

## コミット前チェックフロー

```
1. コード実装完了
   ↓
2. セキュリティチェックリスト確認
   ↓
3. npm audit 実行
   ↓
4. .env / .dev.vars がコミット対象に含まれていないか確認
   ↓
5. git diff で機密情報がないか確認
   ↓
6. コミット
```

---

## インシデント対応

### 環境変数が漏洩した場合

1. **即座にSupabaseでAPIキーをローテーション**
   - Supabase Dashboard > Settings > API > Reset Keys
2. **Cloudflare Workers の Secret を更新**
   - `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`
3. Gitコミット履歴から削除（`git filter-branch` または `git filter-repo`）
4. `.env` / `.dev.vars` が `.gitignore` に含まれているか再確認

### 脆弱性が発見された場合

1. `npm audit` で詳細確認
2. `npm audit fix` で自動修正
3. 修正不可の場合は該当パッケージを削除または代替パッケージに変更
4. 重大な脆弱性の場合は即座に対応

---

## Astro 6 + Cloudflare Workers の注意点

### 削除された API（使用禁止）

- ❌ `Astro.locals.runtime.env` → `import { env } from 'cloudflare:workers'`
- ❌ `Astro.locals.runtime.cf` → `Astro.request.cf`
- ❌ `Astro.locals.runtime.ctx` → `Astro.locals.cfContext`

### セキュアな環境変数アクセス

**公開値（ブラウザ + サーバー）**:

```typescript
import.meta.env.PUBLIC_SUPABASE_URL;
import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
```

**秘密値（サーバーのみ）**:

```typescript
import { env } from "cloudflare:workers";
env.SUPABASE_SERVICE_ROLE_KEY;
```

---

## セキュリティヘッダの動作確認

Issue #004 の対応により、`src/middleware.ts` が全レスポンスに共通セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を付与しています。定義は `src/lib/security-headers.ts` を参照。

### ローカル環境での確認

```bash
# Astro 開発サーバーを起動
npm run dev

# 別ターミナルで付与されているか確認
curl -sI http://localhost:4321/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

期待される出力例:

```
content-security-policy: default-src 'self'; base-uri 'self'; frame-ancestors 'none'; ...
cross-origin-opener-policy: same-origin
permissions-policy: accelerometer=(), camera=(), ...
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

### 本番環境（Cloudflare Workers）での確認

```bash
curl -sI https://member-site-template.fune-gaku.workers.dev/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

### スキャナでの評価

- [Mozilla Observatory](https://observatory.mozilla.org/) で **A 以上**
- [securityheaders.com](https://securityheaders.com/) で **A 以上**

### CSP 違反チェック

ブラウザ DevTools の Console を開き、以下を操作しても CSP error が出ないことを確認:

- サインアップ・サインイン・サインアウト
- プロフィール画面でアバター画像を表示（`https://<ref>.supabase.co/...`）
- 任意のページのハイドレーション

---

## セッション寿命方針（Remember Me 非採用）

### 基本方針

本テンプレートでは **「ログイン状態を保持」（Remember Me）チェックボックスは採用しない**。セッションの寿命は **Supabase プロジェクト単位の設定に一元化** する。

### 根拠（Supabase 公式設計）

Supabase Auth のセッション寿命は、個々のサインインごとに切り替える API を提供していない。公式の [Sessions ガイド](https://supabase.com/docs/guides/auth/sessions) では、セッションの有効期限はすべて **プロジェクト単位**（Supabase Dashboard > Authentication > Sessions）で設定する前提になっている。

公式が提供する 3 つの制御軸はいずれもプロジェクト設定：

| 設定項目               | 説明                                                       | 設定場所                             |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------ |
| Time-box user sessions | サインインから固定時間でセッションを強制失効               | Dashboard > Auth > Sessions          |
| Inactivity timeout     | 一定時間リフレッシュされなかったセッションを失効           | Dashboard > Auth > Sessions          |
| Single session per user | 同一ユーザーは最後にサインインしたセッションのみ有効に保つ | Dashboard > Auth > Sessions          |

> "To make sure that users are required to re-authenticate periodically, you can set a positive value for the Time-box user sessions option in the Auth settings for your project."
> — Supabase Docs, *Sessions*

つまり **公式は per-login の Remember Me をサポートしていない**。JS クライアントで「長く保つ／保たない」を切り替える手段もない（Cookie は常に `@supabase/ssr` が secure / http-only で管理）。

### テンプレートでの扱い

- サインイン画面にチェックボックスを **置かない**（Issue #009 で削除済）。
- 運用側で寿命を変えたい場合は、Supabase Dashboard の **Auth > Sessions** で以下を設定する：
  - 長期利用メインの会員サイト → Time-box を長め（例: 30 日）+ Inactivity timeout を適度に
  - 管理画面・金融系など高セキュリティ要件 → Time-box を短め（例: 24 時間）+ Single session を有効化
- セッションリフレッシュは `@supabase/ssr` の `createServerClient` と `middleware.ts` の `supabase.auth.getUser()` が自動で行う（[認証フロー](./architecture.md#認証フロー) 参照）。

### 実装上の注意

- UI に「ログイン状態を保持」トグルを追加しないこと（Supabase の API 上、挙動を分岐できず誤解を生むため）。
- セッションを明示的に終了させたい場合は **サインアウト** を使う（`supabase.auth.signOut()`）。
- 設定変更は即時反映されない点に注意：公式ドキュメント曰く *"Sessions are not proactively destroyed when you change these settings, but rather the check is enforced whenever a session is refreshed next."* — 変更後も既存セッションは次回リフレッシュ時に評価される。

---

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase RLS Deep Dive](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Sessions ガイド](https://supabase.com/docs/guides/auth/sessions)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)
- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Astro Security](https://docs.astro.build/en/guides/security/)
