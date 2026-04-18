-- ========================================
-- クリーンアップスクリプト
-- ========================================
-- 既存のテーブル・ポリシー・トリガーを削除してクリーンな状態にします。
-- 注意: このスクリプトは開発環境でのみ使用してください。
--       本番環境では実行しないでください。

-- ----------------------------------------
-- Storage ポリシー削除
-- ----------------------------------------
drop policy if exists "Users can view own avatars" on storage.objects;
drop policy if exists "Users can upload own avatars" on storage.objects;
drop policy if exists "Users can update own avatars" on storage.objects;
drop policy if exists "Users can delete own avatars" on storage.objects;

-- avatars バケット削除
-- 注意: Storage バケットは SQL から直接削除できません。
--       Supabase Dashboard > Storage > avatars バケット > Settings > Delete bucket
--       から手動で削除してください。
-- delete from storage.buckets where id = 'avatars';  -- これはエラーになります

-- ----------------------------------------
-- member_posts テーブル削除
-- ----------------------------------------
drop policy if exists "Users can view own posts" on public.member_posts;
drop policy if exists "Users can insert own posts" on public.member_posts;
drop policy if exists "Users can update own posts" on public.member_posts;
drop policy if exists "Users can delete own posts" on public.member_posts;

drop table if exists public.member_posts cascade;

-- ----------------------------------------
-- profiles テーブル削除
-- ----------------------------------------
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

-- トリガー削除
drop trigger if exists on_auth_user_created on auth.users;

-- 関数削除
drop function if exists public.handle_new_user() cascade;

-- テーブル削除
drop table if exists public.profiles cascade;
