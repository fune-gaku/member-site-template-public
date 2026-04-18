-- ========================================
-- Phase 1.5: プロフィール画像永続化対応
-- ========================================

-- ----------------------------------------
-- profiles テーブルに avatar_url カラムを追加
-- ----------------------------------------
alter table public.profiles
add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is 'Supabase Storage avatars バケット内のファイルパス（例: user_id/timestamp_filename.jpg）';

-- ----------------------------------------
-- 既存ユーザー対応: profiles レコードが存在しない場合は作成
-- ----------------------------------------
-- 001_init.sql 実行前にユーザー登録していた場合、profiles レコードが存在しない可能性があるため
insert into public.profiles (user_id, display_name, role)
select
  id,
  coalesce(raw_user_meta_data->>'display_name', ''),
  'member'
from auth.users
where not exists (
  select 1 from public.profiles where user_id = auth.users.id
);
