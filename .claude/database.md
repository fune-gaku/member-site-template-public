# データベース設計

## 概要

- **DBMS**: PostgreSQL (Supabase)
- **スキーマ管理**: Supabase Migrations (`supabase/migrations/*.sql` を Git で管理し、本番適用は SQL Editor から手動実行)
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

| カラム名       | 型            | 制約                                                                    | 説明                       |
| -------------- | ------------- | ----------------------------------------------------------------------- | -------------------------- |
| `user_id`      | `uuid`        | PRIMARY KEY, REFERENCES `auth.users(id)` ON DELETE CASCADE              | Supabase Auth のユーザーID |
| `display_name` | `text`        | NULL可                                                                  | 表示名                     |
| `role`         | `text`        | NOT NULL, DEFAULT `'member'`, CHECK (`role` IN (`'member'`, `'admin'`)) | ユーザーロール             |
| `created_at`   | `timestamptz` | NOT NULL, DEFAULT `now()`                                               | 作成日時                   |
| `updated_at`   | `timestamptz` | NOT NULL, DEFAULT `now()`                                               | 更新日時                   |

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

| バケット名 | 公開設定          | 用途                       |
| ---------- | ----------------- | -------------------------- |
| `avatars`  | Private（非公開） | ユーザーのアバター画像保存 |

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

## マイグレーション適用手順

### ローカル開発環境

1. Supabase ダッシュボード（https://supabase.com/dashboard）にログイン
2. プロジェクトを選択
3. 左メニューから「SQL Editor」を選択
4. `supabase/migrations/001_init.sql` の内容をコピー＆ペースト
5. 「Run」ボタンをクリック

### 本番環境

同様の手順で本番環境の Supabase プロジェクトにマイグレーションを適用。

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

- マイグレーションファイルは `001_init.sql`, `002_add_xxx.sql` のように連番で管理
- 本番適用前に必ずローカルでテスト
- 破壊的変更（テーブル削除など）は慎重に行う
