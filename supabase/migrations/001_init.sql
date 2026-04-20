-- ========================================
-- 初期セットアップ: 全テーブル・RLS・Storage バケット・トリガー
-- ========================================
--
-- このファイル 1 つを Supabase SQL Editor で実行すれば、テンプレートに必要な
-- DB 構造が全て揃います。新規プロジェクトではこれを最初に流してください。
-- 既存環境を初期化する場合は先に 000_cleanup.sql を実行します。
--
-- 含まれる設定:
--   - public.profiles (display_name 100 文字 CHECK 制約含む) + RLS + 権限昇格防止 + service_role grant
--   - public.member_posts + RLS
--   - Storage avatars バケット (MIME 4 種類のみ、5 MB 上限) + RLS
--   - handle_new_user() トリガー (auth.users → profiles 自動作成)
--
-- 関連 Issue:
--   - #001 日本語ファイル名対応 (アプリ層: src/lib/avatar-upload.ts)
--   - #007 display_name サーバ検証 (DB 側の CHECK をここに統合)
--   - #008 avatars バケット MIME/サイズ制限 (バケット作成時に直接設定)

-- ----------------------------------------
-- profiles テーブル
-- ----------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Issue #007: 多層防御として display_name を 100 文字以下に制限。
  -- アプリ層の Zod 検証 (Astro Action profile.update) と二重化する。
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 100)
);

comment on column public.profiles.avatar_url is
  'Supabase Storage avatars バケット内のファイルパス（例: user_id/timestamp_filename.jpg）';
comment on constraint profiles_display_name_length on public.profiles is
  'Issue #007: display_name を 100 文字以下に制限（多層防御）';

alter table public.profiles enable row level security;

-- RLS Policies for profiles
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = user_id);

-- 権限昇格攻撃（Privilege Escalation）防止:
-- 一般ユーザー（authenticated ロール）からは role 列の UPDATE 権限を剥奪する。
-- カラムレベル権限は RLS より先に評価されるため、RLS の with check で
-- サブクエリを書くよりシンプルで堅牢。
-- role の変更は管理者が service_role 経由（createAdminClient）で行う前提。
revoke update (role) on public.profiles from authenticated;

-- service_role への明示 grant（多層防御）:
-- PostgreSQL の挙動上、テーブル所有者（service_role が該当）は REVOKE の影響を
-- 受けないため実運用では service_role から role 列を更新できるが、Supabase 公式
-- ドキュメントでは column privilege bypass が明文化されていない。
-- 明示的に付与することで admin.updateUserRole の動作を将来にわたって保証する。
grant update on public.profiles to service_role;

-- 新規ユーザー作成時に profiles を自動作成するトリガー
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

-- ----------------------------------------
-- member_posts テーブル（サンプル用）
-- ----------------------------------------
create table public.member_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

alter table public.member_posts enable row level security;

-- RLS Policies for member_posts
create policy "Users can view own posts"
on public.member_posts for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own posts"
on public.member_posts for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own posts"
on public.member_posts for update
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can delete own posts"
on public.member_posts for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ----------------------------------------
-- avatars バケット + MIME/サイズ制限 + RLS
-- ----------------------------------------
-- Issue #008: バケット作成時に allowed_mime_types と file_size_limit を直接付与する。
-- NULL のままだと無制限になるため、SVG を含む実行可能形式を拒否し 5 MB 上限を掛ける。
-- 公式: https://supabase.com/docs/guides/storage/buckets/fundamentals
-- > "Upload restrictions like max file size and allowed content types are
-- >  defined at the bucket level."
--
-- NOTE: image/svg+xml を **意図的に除外** している。
-- SVG は XML + JS 実行コンテナ (onload / <script> を埋め込める) で、
-- 同一ホスト (<ref>.supabase.co) 上で Stored XSS になり得るため画像として扱わない。
--
-- on conflict do update: 既存環境でバケットだけが先にあり制限未設定のまま残っている
-- ケースに備えて、再実行時は allowed_mime_types / file_size_limit を上書き同期する。
insert into storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
values (
  'avatars',
  'avatars',
  false,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  5 * 1024 * 1024  -- 5 MB (bytes)
)
on conflict (id) do update
set allowed_mime_types = excluded.allowed_mime_types,
    file_size_limit = excluded.file_size_limit;

-- RLS Policies for avatars bucket (自分の user_id フォルダ配下のみ操作可)
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

create policy "Users can update own avatars"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

create policy "Users can delete own avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars' and
  (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
);

-- ========================================
-- 運用: 棚卸しクエリ（必要な時に手動実行）
-- ========================================
-- 既存のアバターオブジェクトで MIME / サイズ制限違反があるか確認するには、
-- Supabase SQL Editor で以下のクエリを手動実行する。
-- 削除は行わない（データ損失を防ぐため）。運用側で確認 → 手動削除する前提。
--
-- -- サイズ違反 (5MB 超)
-- select count(*) as oversized_count
--   from storage.objects
--  where bucket_id = 'avatars'
--    and (metadata->>'size' is null or (metadata->>'size')::bigint > 5 * 1024 * 1024);
--
-- -- MIME 違反
-- select id, name, owner,
--        metadata->>'mimetype' as mime, metadata->>'size' as size_bytes, created_at
--   from storage.objects
--  where bucket_id = 'avatars'
--    and coalesce(metadata->>'mimetype', '') not in
--        ('image/png','image/jpeg','image/webp','image/gif');
