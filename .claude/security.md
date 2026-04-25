# セキュリティガイドライン

## 概要

このドキュメントでは、会員サイトテンプレートで実装済みのセキュリティ対策と運用方針を定義します。

### 関連ドキュメント

セキュリティに関連する記述は本リポジトリ内で以下に分散している。役割で使い分ける:

| ドキュメント                                                              | 役割                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 本ファイル                                                                | チェックリスト（実装済み / 将来課題） / 脅威モデル / コーディングルール / **新規実装時のセルフチェック** / 既存実装の解説 |
| [database.md](./database.md#新規マイグレーション時のセルフチェックリスト) | RLS / カラムレベル権限 / 新規マイグレーション時のセルフチェック                                                           |
| [deployment.md「セキュリティ設定」](./deployment.md#セキュリティ設定)     | Supabase Email Templates / Custom SMTP (Resend) / パスワードポリシー — 本番デプロイ時に必須の Dashboard 側設定            |

---

## セキュリティチェックリスト

**このチェックリストの役割**: 本テンプレートが対応しているセキュリティ項目の一覧（実装状況のスナップショット）。新規プロジェクトはこの `[x]` 状態からスタートします。リグレッション（既存 `[x]` 項目を壊していないか）の確認に使ってください。

**コミット前に毎回動的に確認する項目**は [コミット前チェックフロー](#コミット前チェックフロー) 節を参照。**新規テーブル/ポリシー/関数を追加する際のチェック**は [.claude/database.md](./database.md#新規マイグレーション時のセルフチェックリスト) を参照。

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
- [x] CSRF 対策：状態変更操作は POST のみ、`security.checkOrigin` 有効（→ [CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路)）
- [x] OTP / PKCE の適切な分離：メールリンクは `/auth/confirm` のランディング経由でスキャナ GET 耐性を確保（→ [メール経由の認証フロー](./architecture.md#メール経由の認証フロー-issue-002--002-b)）
- [x] Open Redirect 対策：`next` クエリは `safeNextPath` でサニタイズ（`src/lib/safe-redirect.ts`）
- [x] Supabase メールテンプレートで `{{ .ConfirmationURL }}` は禁止、`{{ .TokenHash }}` + `/auth/confirm` 経由に統一
- [x] Supabase Dashboard のセキュリティ設定を完了（→ [Supabase Dashboard セキュリティ設定チェックリスト](#supabase-dashboard-セキュリティ設定チェックリスト)）
- [ ] **未実装（将来課題）**: admin role への MFA / TOTP 必須化。Supabase Auth は MFA factor をサポートしているため、admin が増えるタイミングで導入を検討する

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
- [x] Mass Assignment 対策：Zod input スキーマで受け付けるフィールドを必要最小限に絞り、`user_id` などサーバー側で確定すべき値はクライアント入力を信頼せず `auth.getUser()` から導出（`posts.create` / `posts.update` / `admin.updateUserRole`）
- [x] IDOR（Insecure Direct Object Reference）対策：ID 参照型の更新／削除 Action（`posts.update` / `posts.delete` 等）は RLS に加え、サーバ側で `.eq("user_id", user.id)` を明示して **多層防御**（[src/actions/index.ts](../src/actions/index.ts) 参照）

### ✅ その他（ネットワーク・ヘッダ・運用）

- [x] 依存パッケージに既知の脆弱性がない（CI の `npm audit --audit-level=high` が PR と週次で自動チェック）
- [x] Dependabot で依存パッケージの更新を週次で自動追跡（[.github/dependabot.yml](../.github/dependabot.yml)）
- [x] gitleaks の pre-commit hook で秘密情報のコミットを自動ブロック（[.githooks/pre-commit](../.githooks/pre-commit)）
- [x] セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を全レスポンスに付与（`src/lib/security-headers.ts`、→ [セキュリティヘッダの動作確認](#セキュリティヘッダの動作確認)）
- [x] CORS 設定が適切（Cloudflare Workers が自動管理）
- [x] HTTPS 強制（Cloudflare Workers が自動管理）
- [x] セキュアな Cookie 設定（`@supabase/ssr` が自動管理）
- [x] マイグレーション運用ルールを定義（→ [マイグレーション運用ルール](#マイグレーション運用ルール)）
- [ ] **未実装（将来課題）**: Astro Actions のレートリミット（書き込み系: `posts.create` / `auth.signUp` / `admin.inviteUser` 等）。当面は Supabase Auth 側の組込みレートと Cloudflare の DDoS 自動軽減に依存。本格運用時は Cloudflare Rate Limiting Rules で `/_actions/*` を制限する
- [ ] **未実装（将来課題）**: Storage `avatars` のユーザー別クォータ。1 ユーザーが履歴蓄積で容量を圧迫する可能性あり。当面は [運用: 既存オブジェクトの棚卸し](#運用-既存オブジェクトの棚卸し) のクエリで手動管理

---

## 新規実装時のセルフチェックリスト

[database.md「新規マイグレーション時のセルフチェックリスト」](./database.md#新規マイグレーション時のセルフチェックリスト) と並ぶ、**コードを足すときに確認する観点**。「実装済みスナップショット」とは目的が違うので独立節にしている。

### 新規 Astro Action を追加するとき

- [ ] `defineAction` の `input` に Zod スキーマを指定し、**サーバーが受け付けるフィールドだけを並べる**（Mass Assignment 防止）
- [ ] `user_id` などサーバー側で確定すべき値はクライアント入力から取らず、`supabase.auth.getUser()` の `user.id` から導出する
- [ ] 認証必須なら handler 冒頭で `auth.getUser()` を呼び、未認証なら `ActionError({ code: "UNAUTHORIZED" })` を投げる
- [ ] admin 専用なら `requireAdmin(context)` を使う（`role === "admin"` の検証 + 認証統合）
- [ ] ID 参照型の更新／削除は **RLS に加えて `.eq("user_id", user.id)` を明示** して多層防御（IDOR / horizontal privilege escalation）
- [ ] 自分自身に対する破壊的操作は handler 側でも明示的に拒否（例: `admin.updateUserRole` の self-demotion 禁止）
- [ ] エラー時は内部詳細を返さず、ユーザー向けの簡潔な日本語メッセージを `ActionError.message` に詰める。詳細は `console.error("<context>:", error)` で残す
- [ ] 入力の各フィールドに合理的な上限を Zod の `.max()` で設ける（DoS 抑止 / 多層防御）
- [ ] テスト: 認証失敗 / バリデーション失敗 / 認可失敗 / 正常系の少なくとも 4 ケースを `tests/unit/actions-schema.test.ts` などに追加
- [ ] 高頻度な書き込み系（投稿作成・招待送信等）は将来 Cloudflare Rate Limiting で制限する想定。重要な Action は GitHub Issue として記録しておく

### 新規ページ・ルートを追加するとき

- [ ] 認証要否を `src/middleware.ts` のパス判定に反映（`/member/*` / `/admin/*` 配下なら自動で適用される）
- [ ] 状態変更は GET ではなく POST + `<form action={actions.x.y}>` 経由（[CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路) と同じ原則）
- [ ] ハイドレーションが必要な Vue コンポーネントだけ `client:load` を付ける（最小限の JS 配信）
- [ ] 新規の外部リソース（フォント / 画像ホスト / 外部 API）を読み込むなら、CSP に該当ホストを追加（`src/lib/security-headers.ts`）して DevTools で違反が出ないかを必ず確認
- [ ] 認証情報を含む応答が CDN にキャッシュされないことを確認（`/_actions/*` や `/member/*` `/admin/*` で `Cache-Control: private, no-store` 相当の挙動になっているか）
- [ ] `next` 等のリダイレクト先パラメータを受ける場合は必ず `safeNextPath` でサニタイズ（Open Redirect / CWE-601）
- [ ] テスト: SSR 出力の最低限の検証を `tests/integration/pages.test.ts` に追加

### 新規 npm 依存を追加するとき

- [ ] **runtime か dev か** を意識し、runtime は最小化（バンドルサイズ・サプライチェーンリスクを縮める）
- [ ] パッケージの GitHub / npm ページを開き、メンテナンス頻度・直近のセキュリティ Advisory・スター数で健全性を確認
- [ ] postinstall / preinstall script を持つか `npm view <pkg> scripts` で確認（あれば挙動を読む）
- [ ] `npm audit --audit-level=high` でヒットしないこと
- [ ] 追加後に `npm ls <pkg>` で意図しない複数バージョン共存が起きていないか確認（必要なら `package.json` の `overrides` で固定）
- [ ] 追加コミットは `chore(deps): ...` で単独に作る（複数依存の追加・複数依存の更新を 1 コミットに混ぜない）

---

## 脅威モデル

### 想定する脅威

| 脅威                     | リスクレベル | 対策                                                                                                                                                                         |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 環境変数の漏洩           | 高           | `.gitignore`、コードレビュー                                                                                                                                                 |
| 権限昇格攻撃             | 高           | `revoke update (role)` でカラムレベル権限制御                                                                                                                                |
| XSS攻撃                  | 中           | Vue自動エスケープ、`v-html`禁止                                                                                                                                              |
| SQLインジェクション      | 中           | Supabaseクライアント使用（パラメータ化クエリ）                                                                                                                               |
| 不正ファイルアップロード | 中           | 拡張子・MIME・サイズ制限（5MB）                                                                                                                                              |
| セッションハイジャック   | 中           | Secure Cookie、HTTPS、トークン自動リフレッシュ                                                                                                                               |
| CSRF攻撃                 | 低           | SameSite Cookie（`@supabase/ssr`）+ Astro Actions POST 限定 + `security.checkOrigin`（Origin/Referer 照合）。[CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路)参照 |
| RLS バイパス             | 高           | RLS を全テーブルで有効化、service_role キーはサーバーのみ                                                                                                                    |

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

## Supabase Dashboard セキュリティ設定チェックリスト

マイグレーション SQL に現れないが、**新規 Supabase プロジェクト構築時に Dashboard で必ず設定する項目**。Supabase 公式 [Going into Prod](https://supabase.com/docs/guides/deployment/going-into-prod) と [Password Security](https://supabase.com/docs/guides/auth/password-security) に基づく。

### Auth 設定（Authentication > Providers > Email / Settings）

| 項目                    | 推奨値                     | 理由                                                              |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| Email confirmation      | **ON**                     | メール到達性を保証、なりすまし登録防止                            |
| OTP 有効期限            | **≤ 3600 秒（1 時間）**    | Supabase 公式推奨上限。超えると Security Advisor が警告           |
| Minimum password length | **8 文字**                 | `src/lib/auth-schemas.ts` の Zod `passwordSchema` と一致させる    |
| Password requirements   | **数字 + 小文字 + 大文字** | アプリ側 Zod と一致させる（Zod で先に弾き、Dashboard で二重防御） |
| Confirm email change    | **ON**                     | メール変更時の乗っ取り防止                                        |
| Secure email change     | **ON**                     | 旧メール側での承認を要求                                          |

### Sessions 設定（Authentication > Sessions）

本テンプレートの方針は [セッション寿命方針（Remember Me 非採用）](#セッション寿命方針remember-me-非採用) 参照。プロジェクトの要件に応じて以下を設定:

| 項目                    | 汎用会員サイト | 管理画面・金融系 |
| ----------------------- | -------------- | ---------------- |
| Time-box user sessions  | 30 日          | 24 時間以内      |
| Inactivity timeout      | 適度な値       | 短め             |
| Single session per user | OFF            | **ON**           |

### 組織・プロジェクト側（Account > Security / Organization）

| 項目                        | 推奨         | 備考                                     |
| --------------------------- | ------------ | ---------------------------------------- |
| Supabase アカウントの MFA   | **有効**     | 乗っ取られるとプロジェクトごと支配される |
| Organization の複数 owner   | **2 名以上** | Bus factor 対策                          |
| GitHub 連携アカウントの 2FA | **有効**     | 同上                                     |

### Pro プラン以上で追加で有効化する項目

無料プランでは使えないが、課金後に必ず有効化するもの:

| 項目                               | プラン                   | 用途                                                                                 |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Leaked password protection（HIBP） | **Pro 以上**             | 流出済みパスワードを拒否。無料プランではアプリ層の `ENABLE_HIBP_CHECK=true` で代替中 |
| Point in Time Recovery (PITR)      | **Pro 以上（アドオン）** | DB 障害時の任意時点復元                                                              |
| Network restrictions               | **Pro 以上**             | DB 接続元 IP 制限                                                                    |

---

## マイグレーション運用ルール

### 基本方針

| ルール                                                                                                                  | 理由                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [supabase/migrations/000_cleanup.sql](../supabase/migrations/000_cleanup.sql) は **開発専用**、本番では絶対に実行しない | `drop table cascade` が含まれるため実行するとユーザーデータが全消失 |
| 本番適用は **Supabase SQL Editor で手動実行**、CI から自動適用しない                                                    | レビュー機会を確保し、事故時の巻き戻し判断を人間に残す              |
| 既存マイグレーションファイル（`001_init.sql` など）は **基本的に変更しない**、新規ファイル `002_xxx.sql` を追加         | 適用済み環境との差分管理のため                                      |
| 破壊的変更（`drop column` / `drop table` / `alter type`）は **PR レビュー必須**                                         | データ損失・ダウンタイムに直結                                      |
| 本番適用前に **必ずローカル環境で `000_cleanup.sql` → `001_init.sql` + 新規ファイル** の順で再現確認                    | 他マイグレーションとの干渉を検出                                    |

### 本番適用フロー

```
1. ローカル開発で 002_xxx.sql を作成
   ↓
2. ローカル Supabase で 000_cleanup.sql → 001_init.sql → 002_xxx.sql を順に実行して動作確認
   ↓
3. PR レビュー（破壊的変更があれば必ず）
   ↓
4. main マージ
   ↓
5. 本番 Supabase Dashboard > SQL Editor で 002_xxx.sql のみを手動実行
   ↓
6. 本番 Supabase Dashboard > Database > Advisors を実行し、新規違反がないか確認
   ↓
7. アプリをデプロイ（スキーマ差分による実行時エラーを回避）
```

### マイグレーション適用直後に必ずやること

1. **Supabase Security Advisor を Run**（新規マイグレーションが RLS 未有効テーブル等を生まないか）
2. **Supabase Performance Advisor を Run**（FK に index 漏れがないか）
3. **本番の動作確認**（`curl` で `/member/*` が 200 / サインアップが通る 等）

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
6. コミット（.githooks/pre-commit で gitleaks が自動実行される）
```

### 自動化されているチェック

| 層                      | 仕組み                                                                  | タイミング                        | 対象                                       |
| ----------------------- | ----------------------------------------------------------------------- | --------------------------------- | ------------------------------------------ |
| ローカル                | [.githooks/pre-commit](../.githooks/pre-commit) + gitleaks              | コミット時                        | staged ファイルの秘密情報                  |
| CI（GitHub Actions）    | [.github/workflows/npm-audit.yml](../.github/workflows/npm-audit.yml)   | PR（package.json 変更）+ 週次月曜 | 依存パッケージの脆弱性（high 以上で fail） |
| GitHub プラットフォーム | [.github/dependabot.yml](../.github/dependabot.yml) + Dependabot alerts | 週次月曜 09:00 JST                | npm / GitHub Actions の更新 PR 自動生成    |

**初回セットアップ**:

```bash
brew install gitleaks   # pre-commit hook が機能するために必須
npm install             # prepare スクリプトで core.hooksPath を .githooks に設定
```

**GitHub リポジトリ設定**（一度だけ有効化）:

- Settings > Code security > Dependabot alerts: **ON**
- Settings > Code security > Dependabot security updates: **ON**

Secret scanning / Push protection は Private + Free プランでは使えないため、gitleaks の pre-commit hook で代替している。

### 手動で定期実施する項目

| 項目                                                                                                                                         | 頻度                                | 確認場所                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Supabase Security Advisor / Performance Advisor                                                                                              | 月 1 回、マイグレーション適用直後   | Supabase Dashboard > Database > Advisors                                   |
| [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com/) でのヘッダ再評価（A 以上維持） | 四半期に 1 回、または本番デプロイ後 | 本番 URL を入力                                                            |
| CSRF 3 点検（GET 405 / クロスオリジン POST 403 / 同一オリジン POST 200）                                                                     | `/auth/signout` 周辺を改修した直後  | [CSRF 対策（サインアウト経路）](#csrf-対策サインアウト経路) のコマンド参照 |

---

## セキュリティレビュー手順（必須）

**全 PR / 全マージで必須**。pull request を main にマージする前、または PR を介さない直接マージの直前に、3 段階レビューを必ず通す。**人間 + 自動ツール 2 種 + Claude Code 1 種の 4 視点** で多層的に検証する。

> 適用範囲は **すべての変更**。Step 1 / Step 2 はそれぞれ数分で終わるため、例外を作って判断揺れを起こすより一律実施する方が継続しやすい。最小例外は本節末尾参照。

### 3 段階フロー

#### Step 1: `/security-review` skill による自動レビュー

Claude Code 上で内蔵 skill を実行する。pending changes（現在のブランチの差分）に対し、認証・認可・XSS・CSRF・SQLi・情報漏洩などのセキュリティ観点を自動レビューする。

```
/security-review
```

出力結果（findings）を Step 3 の入力としてそのまま保管する。

#### Step 2: OpenAI Codex によるセキュリティチェック

OpenAI Codex（CLI / Web UI、運用環境で利用可能な経路）で以下のテンプレートを使ってレビューを依頼する。

```markdown
以下の git diff に対するセキュリティレビューをお願いします。
このプロジェクトは Astro 6 SSR + Vue 3 + Supabase + Cloudflare Workers
で構成された会員サイトテンプレートです。

【観点】

- 認証・認可（IDOR / 権限昇格 / セッション管理）
- RLS バイパス（Supabase Postgres）
- インジェクション（XSS / SQLi / コマンド）
- CSRF（Astro Actions の状態変更経路）
- Open Redirect
- 情報漏洩（エラーメッセージ / ログ / レスポンス）
- ファイルアップロード
- 依存関係のサプライチェーン
- セキュリティヘッダ（CSP / HSTS / その他）

【出力フォーマット】
重大度別に Critical / High / Medium / Low に分類してください。
各指摘について:

- 該当ファイル・行
- 何が問題か
- 推奨される修正

差分:
[ここに `git diff main...HEAD` の出力を貼り付け]
```

差分が大きい場合はファイル単位に分割して依頼する。出力結果を Step 3 の入力としてそのまま保管する。

#### Step 3: Claude Code による統合レビュー

Step 1 / Step 2 の出力を Claude Code に渡し、以下のテンプレートで統合レビューを依頼する。

```markdown
ブランチ <branch-name> のセキュリティレビュー結果を統合してください。

## /security-review skill の結果

[ここに Step 1 の出力を貼り付け]

## OpenAI Codex の結果

[ここに Step 2 の出力を貼り付け]

以下の観点で統合し、PR description にそのまま貼れる形で出力してください:

1. **重複の確認** — 両者が同じ箇所を指摘している項目（high confidence）
2. **false positive** — どちらか片方の指摘で、コード精査の結果該当しない
   もの（理由を併記）
3. **優先度判定** — Critical / High / Medium / Low + 修正の容易さ
4. **対応方針** — Fix in this PR / Follow-up Issue / Reject（各々の理由）
5. **総括** — このブランチをマージしてよいか

可能なら、対象ファイル・行を具体的に示してください。
```

### 受け入れ基準

main マージの前提として、PR description（または PR 不経由のときはマージコミット本文）に以下を記録する:

- [ ] Step 1 を実行し、Critical / High が 0、または Step 3 で false positive 判定が記録されている
- [ ] Step 2 を実行し、Critical / High が 0、または Step 3 で false positive 判定が記録されている
- [ ] Step 3 の統合レビュー結果（重複・FP・優先度・対応方針・総括）が貼られている
- [ ] 後続 Issue 化したものは GitHub Issue として登録済み（Issue 番号を記録）

### 最小例外

以下のみ Step 1 / Step 2 をスキップして Step 3（Claude Code レビュー）だけで済ませてよい。スキップ時は PR description にその旨と理由を明記する。

- 単一の typo 修正（コードロジックに影響しないコメント / ドキュメントの誤字のみ）
- フォーマット専用コミット（`npm run format` / `npm run lint:fix` の結果のみで実質ロジック変更なし）

判定が微妙な場合は **常に 3 段階を回す** を選択する。

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

| 設定項目                | 説明                                                       | 設定場所                    |
| ----------------------- | ---------------------------------------------------------- | --------------------------- |
| Time-box user sessions  | サインインから固定時間でセッションを強制失効               | Dashboard > Auth > Sessions |
| Inactivity timeout      | 一定時間リフレッシュされなかったセッションを失効           | Dashboard > Auth > Sessions |
| Single session per user | 同一ユーザーは最後にサインインしたセッションのみ有効に保つ | Dashboard > Auth > Sessions |

> "To make sure that users are required to re-authenticate periodically, you can set a positive value for the Time-box user sessions option in the Auth settings for your project."
> — Supabase Docs, _Sessions_

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
- 設定変更は即時反映されない点に注意：公式ドキュメント曰く _"Sessions are not proactively destroyed when you change these settings, but rather the check is enforced whenever a session is refreshed next."_ — 変更後も既存セッションは次回リフレッシュ時に評価される。

---

## CSRF 対策（サインアウト経路）

### 基本方針（Issue #005 で整備済み）

サインアウトのように **状態を変更する操作は必ず POST** とする（RFC 9110 §9.2.1 "safe methods"）。リンクベース CSRF（`<a href="/auth/signout">` を踏ませる／メーラーのプリフェッチ）による **意図しない強制ログアウト** を防ぐため、以下を徹底する：

1. **Astro Action + `<form method="POST" action={actions.auth.signOut}>` のみを経由** して `supabase.auth.signOut()` を呼ぶ。
2. `/auth/signout` ページは互換のため残すが、**GET には `405 Method Not Allowed`** を返す。
3. `astro.config.mjs` の `security.checkOrigin` を **既定値 `true` のまま維持**。これで Astro がクロスオリジン POST を自動的に 403 で拒否する。
4. ナビゲーションヘッダ（`Member.astro` / `Admin.astro`）やダッシュボードの「サインアウト」ボタンは全て form POST（Action 呼び出し）に統一する。`<a href="/auth/signout">` は作らない。

### 手動 CSRF 検証手順

本番デプロイ直後、または `/auth/signout` や `auth.signOut` Action を改修した場合は、必ず以下 3 コマンドを実行して挙動を確認する。

```bash
# 1) 攻撃者視点: クロスオリジン GET（リンク踏ませ・メーラー URL プリフェッチを模擬）
curl -i -X GET https://member-site-template.fune-gaku.workers.dev/auth/signout
# 期待: HTTP/2 405 / Allow: POST （Cookie が付いていても sb-* の delete は起きない）

# 2) 攻撃者視点: クロスオリジン POST（Origin ヘッダが別サイト）
curl -i -X POST \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 403 （Astro security.checkOrigin が Origin/Referer 不一致で拒否）

# 3) 同一オリジン POST（正規フロー、ダッシュボードのボタン相当）
curl -i -X POST \
  -H "Origin: https://member-site-template.fune-gaku.workers.dev" \
  -H "Referer: https://member-site-template.fune-gaku.workers.dev/member/dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --cookie "sb-...=..." \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 200 / Set-Cookie: sb-...=; Max-Age=0 （セッション Cookie 削除）
```

ローカル（`npm run dev` + `npm run preview`）でも同じ 3 パターンを `http://localhost:4321` に対して流し、**GET が 405** かつ **クロスオリジン POST が 403** になることを確認する。

### 受け入れ基準（Issue #005）

- [x] `curl -X GET /auth/signout` が **405 Method Not Allowed** を返す
- [x] クロスオリジン POST が **403** で拒否される（`security.checkOrigin` の動作）
- [x] スパムメールの URL スキャナーが GET しても Cookie 削除が走らない（curl で確認）
- [x] ダッシュボード・ナビゲーションヘッダのサインアウトがクリック 1 回で従来どおり動作する

### 参考

- [Astro: Actions (forms and mutations)](https://docs.astro.build/en/guides/actions/)
- [Astro: security.checkOrigin](https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 9110 §9.2.1 Safe Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1)

---

## ファイルアップロードのガイドライン

### 基本方針（Issue #008 / #001 で整備済み）

`avatars` バケットのようなユーザーアップロードは、**多層防御**を徹底する。重要度の高い順に:

1. **バケット設定（Supabase Storage）が真の防衛線**
   - `storage.buckets.allowed_mime_types` と `file_size_limit` を必ず設定する
     （→ `supabase/migrations/001_init.sql` の avatars バケット INSERT セクション）
   - 公式ドキュメントでも _"Upload restrictions like max file size and allowed content types are defined at the bucket level"_ と明記されている
2. **サーバ側（Astro Action の Zod）で早期検証**
   - `.refine()` で MIME タイプとサイズを 400 応答で弾く（UX 向上）
   - `upload()` 呼び出し時に `contentType: input.file.type` を **明示指定**し、クライアントが送ってくる Content-Type を盲信しない
3. **クライアント側検証は UX 目的のみ**
   - `<input accept="...">` と JS の `file.type` チェックは DevTools で迂回可能
   - これ単体をセキュリティ対策として扱わない

### 許可する MIME タイプ

`avatars` バケットは以下の 4 種類のみを許可する:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`

**`image/svg+xml` は許可しない**。SVG は XML + JavaScript を埋め込める実行コンテナであり、署名付き URL で開かれると `<ref>.supabase.co` 上で Stored XSS が成立し得る（[MDN: SVG restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/SVG_as_an_Image#restrictions)）。どうしても SVG を扱いたい場合は、ダウンロード専用にする or 別バケットで `Content-Disposition: attachment` 固定、のような追加対策を要する。

### ファイルサイズ

- 上限: **5 MB** (5 \* 1024 \* 1024 バイト)
- 定義場所: `src/lib/avatar-upload.ts` の `MAX_AVATAR_SIZE` を **真実の源**として使い、バケット設定・Action・UI で共有する

### ファイル名サニタイゼーション（Issue #001）

- **日本語・絵文字・多言語 Unicode は保持する** (UX)
- `/` `\` `:` `*` `?` `"` `<` `>` `|` と制御文字のみ `_` に置換 (OS 互換 / パストラバーサル)
- `..` は `_` に畳み込む（パストラバーサル対策）
- 先頭末尾の空白・ドットはトリム（Windows の trailing-dot 解釈事故回避）
- 実装: `src/lib/avatar-upload.ts` の `sanitizeAvatarFileName()`
- 旧実装 `/[^a-zA-Z0-9._-]/g` は国際化できないため廃止

### 運用: 既存オブジェクトの棚卸し

バケット制限を後から追加した場合、過去にアップロードされたファイルはそのまま残る。以下のクエリで違反オブジェクトを洗い出し、運用判断で削除する:

```sql
-- 5MB 超 or 許可されていない MIME のオブジェクト
select id, name, owner, metadata->>'mimetype' as mime, metadata->>'size' as size
  from storage.objects
 where bucket_id = 'avatars'
   and (
     (metadata->>'size')::bigint > 5 * 1024 * 1024
     or coalesce(metadata->>'mimetype', '') not in (
       'image/png','image/jpeg','image/webp','image/gif'
     )
   );
```

### 参考

- [Supabase Storage: Fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase Storage: Creating Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Supabase Storage: Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [RFC 3986 URI](https://www.rfc-editor.org/rfc/rfc3986)

---

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase RLS Deep Dive](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Sessions ガイド](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Storage Fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)
- [Cloudflare Workers Security](https://developers.cloudflare.com/workers/platform/security/)
- [Astro Security](https://docs.astro.build/en/guides/security/)
