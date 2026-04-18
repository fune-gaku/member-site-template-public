-- ========================================
-- Phase 1: 初期マイグレーション
-- ========================================

-- ----------------------------------------
-- profiles テーブル
-- ----------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
-- これにより、ユーザーが自分の profile 行を更新する際、role 列だけは変更できなくなる。
-- カラムレベル権限は RLS より先に評価されるため、RLS の with check で
-- サブクエリを書くよりシンプルで堅牢。
-- role の変更は管理者が service_role 経由（createAdminClient）で行う前提。
revoke update (role) on public.profiles from authenticated;

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
-- avatars バケット + RLS
-- ----------------------------------------
-- バケットが既に存在する場合はスキップ（on conflict do nothing）
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- RLS Policies for avatars bucket
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
