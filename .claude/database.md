# データベース設計

## 概要

- **DBMS**: PostgreSQL (Supabase)
- **スキーマ管理**: Supabase CLI ベース (`supabase init` で生成された `supabase/config.toml` + `supabase/migrations/<14桁タイムスタンプ>_<topic>.sql`)。Issue #34 で CLI 運用に移行（旧: `001_init.sql` を SQL Editor 手動実行）
- **ローカル**: `npm run db:start` (Supabase Docker stack 起動) → `npm run db:reset` (全マイグレーション適用)
- **本番**: `supabase db push` (新規プロジェクト) / `supabase migration repair --status applied <version>` (既存 fork の同期)
- **RLS（Row Level Security）**: 全テーブルで有効化、ユーザーは自分のデータのみアクセス可能

---

## テーブル一覧

| テーブル名     | 説明                 | 主要カラム                        |
| -------------- | -------------------- | --------------------------------- |
| `profiles`     | ユーザープロフィール | `user_id`, `display_name`, `role` |
| `member_posts` | 会員投稿（サンプル） | `id`, `user_id`, `title`, `body`  |

---

## 主要テーブル定義

### profiles

ユーザーのプロフィール情報を管理するテーブル。

| カラム名       | 型            | 制約                                                                    | 説明                                        |
| -------------- | ------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `user_id`      | `uuid`        | PRIMARY KEY, REFERENCES `auth.users(id)` ON DELETE CASCADE              | Supabase Auth のユーザーID                  |
| `display_name` | `text`        | NULL可, CHECK `char_length(display_name) <= 100`（Issue #007）          | 表示名（多層防御として 100 文字以下に制限） |
| `avatar_url`   | `text`        | NULL可                                                                  | Supabase Storage のアバターファイルパス     |
| `role`         | `text`        | NOT NULL, DEFAULT `'member'`, CHECK (`role` IN (`'member'`, `'admin'`)) | ユーザーロール                              |
| `created_at`   | `timestamptz` | NOT NULL, DEFAULT `now()`                                               | 作成日時                                    |
| `updated_at`   | `timestamptz` | NOT NULL, DEFAULT `now()`                                               | 更新日時                                    |

**インデックス**:

- PRIMARY KEY: `user_id`

**RLS ポリシー**:

- `"Users can view own profile"`: 自分のプロフィールのみ閲覧可能
- `"Users can update own profile"`: 自分のプロフィールのみ更新可能

**権限昇格攻撃（Privilege Escalation）防止**:

```sql
revoke update (role) on public.profiles from authenticated;
```

一般ユーザーからは `role` 列の UPDATE 権限を剥奪。カラムレベル権限は RLS より先に評価されるため、シンプルで堅牢な防御策。

**トリガー**:

- `on_auth_user_created`: 新規ユーザー作成時に自動的に profiles レコードを作成

---

### member_posts

会員の投稿データ（サンプル用テーブル）。

| カラム名     | 型            | 制約                                                    | 説明               |
| ------------ | ------------- | ------------------------------------------------------- | ------------------ |
| `id`         | `uuid`        | PRIMARY KEY, DEFAULT `gen_random_uuid()`                | 投稿ID             |
| `user_id`    | `uuid`        | NOT NULL, REFERENCES `auth.users(id)` ON DELETE CASCADE | 投稿者のユーザーID |
| `title`      | `text`        | NOT NULL                                                | 投稿タイトル       |
| `body`       | `text`        | NULL可                                                  | 投稿本文           |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()`                               | 作成日時           |

**インデックス**:

- PRIMARY KEY: `id`

**RLS ポリシー**:

- `"Users can view own posts"`: 自分の投稿のみ閲覧可能
- `"Users can insert own posts"`: 自分の投稿のみ作成可能
- `"Users can update own posts"`: 自分の投稿のみ更新可能
- `"Users can delete own posts"`: 自分の投稿のみ削除可能

---

## トリガー

### handle_new_user()

**用途**: 新規ユーザー作成時に自動的に profiles レコードを作成

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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

**動作**:

1. `auth.users` にレコードが INSERT される
2. トリガーが発動し `handle_new_user()` が実行される
3. `profiles` テーブルに自動的にレコードが作成される
4. `display_name` は `raw_user_meta_data` から取得（なければ空文字）

---

## リレーション図

```
auth.users (Supabase Auth)
    ↓ (1:1)
profiles
    user_id (PK, FK → auth.users.id)
    display_name
    role

auth.users
    ↓ (1:N)
member_posts
    id (PK)
    user_id (FK → auth.users.id)
    title
    body
```

---

## データアクセスパターン

### プロフィール取得（サーバーサイド）

```typescript
import { createClient } from "../lib/supabase";

const supabase = createClient({
  request: Astro.request,
  cookies: Astro.cookies,
});

const { data: profile } = await supabase
  .from("profiles")
  .select("display_name, role")
  .eq("user_id", user.id)
  .single();
```

### プロフィール更新（クライアントサイド）

```typescript
import { createBrowserSupabase } from "../lib/supabase-browser";

const supabase = createBrowserSupabase();
const {
  data: { user },
} = await supabase.auth.getUser();

const { error } = await supabase
  .from("profiles")
  .update({ display_name: "新しい名前" })
  .eq("user_id", user.id);
```

### 投稿一覧取得

```typescript
const { data: posts } = await supabase
  .from("member_posts")
  .select("id, title, body, created_at")
  .order("created_at", { ascending: false });
```

---

## Storage構成

### Buckets

| バケット名 | 公開設定          | 用途                       | 制限（Issue #008）                                                                                    |
| ---------- | ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `avatars`  | Private（非公開） | ユーザーのアバター画像保存 | `allowed_mime_types`: `image/png` `image/jpeg` `image/webp` `image/gif` のみ、`file_size_limit`: 5 MB |

**`image/svg+xml` を意図的に除外**: SVG は XML + JS 実行コンテナのため Stored XSS リスクがあり、画像として扱わない。

**RLS ポリシー**:

- `"Users can view own avatars"`: 自分のフォルダ内のファイルのみ閲覧可能
- `"Users can upload own avatars"`: 自分のフォルダにのみアップロード可能
- `"Users can update own avatars"`: 自分のフォルダ内のファイルのみ更新可能
- `"Users can delete own avatars"`: 自分のフォルダ内のファイルのみ削除可能

**フォルダ構造**:

```
avatars/
  └── {user_id}/
      ├── {timestamp}_avatar.png
      └── {timestamp}_avatar2.jpg
```

**アクセス制御**:

```sql
-- 自分の user_id フォルダのみアクセス可能
(storage.foldername(name))[1] = (select auth.jwt()->>'sub')
```

---

## マイグレーション運用

### 前提

- **Docker Desktop** が起動していること
- **Supabase CLI v2 以上** (`supabase --version`)
- ローカルポート 54321 (API) / 54322 (DB) / 54323 (Studio) / 54324 (inbucket) が空いていること

### ローカル開発環境

```bash
# 1. 初回 / 再立ち上げ
npm run db:start          # supabase start ─ Docker stack を起動
npm run db:reset          # supabase db reset ─ 全マイグレーション適用 + (任意の) seed 投入

# 2. 新規マイグレーション作成
supabase migration new <topic>
# → supabase/migrations/<14桁タイムスタンプ>_<topic>.sql が生成される

# 3. 編集後、再度 reset で全件適用し直し
npm run db:reset

# 4. セルフチェック (reset → lint → test)
/db-check                 # Claude Code slash command
# または個別に:
npm run db:lint           # plpgsql_check で SQL 静的解析
npm run db:test           # pgTAP テスト (Issue #35 で整備予定)
```

### 本番適用

#### A. 新規プロジェクト（CLI 運用前提で立ち上げた場合）

```bash
# 一度だけ: ローカル repo を本番 Supabase プロジェクトにリンク
supabase login
supabase link --project-ref <your-project-ref>

# 適用前に差分を確認 (破壊的変更が混じっていないか)
npm run db:push:dry-run

# 本番適用
supabase db push
```

`supabase_migrations.schema_migrations` テーブルが本番側に作られ、適用済みバージョンが記録される。以降の差分は `supabase db push` で自動同期。

#### B. 既存 fork（旧 `001_init.sql` を SQL Editor で適用済みのケース）

旧運用で適用したスキーマと、新運用のマイグレーションファイル (`20260420205000_init.sql`) は内容が同じだが、`supabase_migrations.schema_migrations` には履歴が残っていない。CLI に「これは既に適用済み」と教える必要がある。

```bash
# 1. リンク (新規と同じ)
supabase login
supabase link --project-ref <your-project-ref>

# 2. 既存の init マイグレーションを「適用済み」とマーク (本番 DB は変更しない)
supabase migration repair --status applied 20260420205000

# 3. 以降の新規マイグレーションだけが push 対象になる
npm run db:push:dry-run   # → 「Local migrations are up to date」を確認
```

`migration repair` は **本番 DB のスキーマ自体は触らない**。`schema_migrations` の同期だけが目的なので安全。

---

## 注意事項

### RLS（Row Level Security）

- **必ず有効化すること**: `alter table テーブル名 enable row level security;`
- RLS が無効の場合、すべてのユーザーが全データにアクセス可能になる（セキュリティリスク）
- ポリシーを追加しただけでは不十分。RLS 自体を有効化する必要がある

### 権限昇格攻撃の防止

- `role` 列は一般ユーザーから更新不可（`revoke update (role)`）
- カラムレベル権限は RLS より先に評価されるため、確実に防御できる
- `role` の変更は管理者が `createAdminClient()` 経由で行う

### トリガーのセキュリティ

- `security definer` を使用（トリガー関数は所有者の権限で実行）
- `set search_path = public` でスキーマインジェクションを防止

### Storage の RLS

- `storage.objects` テーブルにも RLS ポリシーを設定
- `bucket_id` と `name`（ファイルパス）で制御
- `storage.foldername(name)` でフォルダ名を抽出し、ユーザーID と照合

### データ型

- タイムスタンプは必ず `timestamptz`（タイムゾーン付き）を使用
- UUID は `uuid` 型を使用（文字列型ではない）

### マイグレーション管理

- **テンプレート方針**: Supabase CLI 規約に準拠 (Issue #34)。新規マイグレーションは必ず `supabase migration new <topic>` で 14 桁タイムスタンプを採番する。手動で `<連番>_<topic>.sql` 形式で作るのは禁止（CLI が認識できなくなる）
- 1 マイグレーション = 1 関心事。新規テーブル + 既存テーブル変更を同じファイルに混ぜない
- 既存マイグレーションファイル (`20260420205000_init.sql`) は本番に適用済みなので **直接編集禁止**。スキーマ変更は新しいタイムスタンプのファイルで追加 / 変更する
- 本番適用前に必ず `/db-check`（ローカル reset + lint + test）を通す
- 破壊的変更（`drop table` 等）は `supabase db push --dry-run` で diff を二重確認してから実行
- 運用フロー・Advisor 実行タイミングは [.claude/security.md](./security.md#マイグレーション運用ルール) を参照

---

## 新規マイグレーション時のセルフチェックリスト

新規テーブル・ポリシー・関数を **`supabase migration new <topic>` で生成した新規マイグレーション** に追加する際、以下を順にチェックする。**1 つでも未チェックなら本番適用しない**。既存実装（`20260420205000_init.sql`）がすべての項目を満たしているため、これに倣う。

### 新規テーブル

- [ ] `alter table <table> enable row level security;` を入れた（忘れると誰でも全データ参照可能）
- [ ] RLS ポリシーを **select / insert / update / delete** の必要な操作分すべて作った
- [ ] 各ポリシーに **`to authenticated`**（または `to anon`）を明示した（`to` 省略は anon でも評価されパフォーマンス低下）
- [ ] ポリシー内で **`(select auth.uid())`** を使った（裸の `auth.uid()` は行ごとに再評価されて遅い）
- [ ] FK カラム（`user_id` 等）および **ポリシーで参照するカラムに index** を貼った
- [ ] ユーザー入力系の text カラムには **CHECK 制約** で長さ上限を設定（多層防御、例: `profiles.display_name` は 100 文字）
- [ ] `role` のような**権限に直結するカラム**は、一般ユーザーから `revoke update (col)` して column-level privilege で保護した

### 新規ポリシー（既存テーブルへの追加）

- [ ] 既存テーブルの RLS が既に enable されていることを確認した
- [ ] `using` 句（SELECT/UPDATE/DELETE）と `with check` 句（INSERT/UPDATE）の**使い分けを理解**して書いた
- [ ] 同じカラムに対する複数ポリシーで、**OR 結合されても穴が生じない**ことを確認した

### 新規関数・トリガー

- [ ] **`security definer`** を付けた（所有者権限での実行が必要な場合）
- [ ] **`set search_path = public`**（または明示スキーマ）を付けた（スキーマインジェクション防止）
- [ ] 関数は Exposed schemas（`public` など）に配置しない場合 `revoke all` で外部 REST 公開を防いだ

### Storage バケット

- [ ] `storage.buckets` への INSERT で **`allowed_mime_types`** と **`file_size_limit`** を明示した（NULL は無制限）
- [ ] `on conflict (id) do update` で既存バケットの制限も同期した
- [ ] `image/svg+xml` を許可する場合は `Content-Disposition: attachment` 等の追加対策を検討した
- [ ] `storage.objects` に対する RLS ポリシーを作った（`bucket_id` + `(storage.foldername(name))[1] = (select auth.jwt()->>'sub')` パターン）

### 適用前・適用後の検証

- [ ] `/db-check` (= `npm run db:reset` → `db:lint` → `db:test`) がローカルで全 green / skip
- [ ] `npm run db:push:dry-run` で適用予定の差分を目視確認（破壊的変更が混じっていないか）
- [ ] 本番適用直後に **Supabase Dashboard > Database > Advisors** を Run し、新規違反が出ていないことを確認
- [ ] アプリをデプロイし、該当テーブル/ポリシーが期待通り動作することを確認（サインアップ、自分のデータ参照、他ユーザーのデータ参照不可、等）
