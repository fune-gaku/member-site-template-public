-- ========================================
-- クリーンアップスクリプト
-- ========================================
-- 既存のテーブル・ポリシー・トリガーを削除してクリーンな状態にします。
-- 注意: このスクリプトは開発環境でのみ使用してください。
--       本番環境では実行しないでください。

-- ----------------------------------------
-- profiles テーブル削除
-- ----------------------------------------
-- トリガー削除
drop trigger if exists on_auth_user_created on auth.users;

-- 関数削除
drop function if exists public.handle_new_user() cascade;

-- テーブル削除（cascade でポリシーも自動削除される）
drop table if exists public.profiles cascade;

-- ----------------------------------------
-- member_posts テーブル削除
-- ----------------------------------------
-- テーブル削除（cascade でポリシーも自動削除される）
drop table if exists public.member_posts cascade;

-- ----------------------------------------
-- Storage ポリシー削除
-- ----------------------------------------
-- ポリシー削除（テーブルが存在しない場合でもエラーにならない）
do $$
begin
  -- avatars バケット用のポリシーを削除
  drop policy if exists "Users can view own avatars" on storage.objects;
  drop policy if exists "Users can upload own avatars" on storage.objects;
  drop policy if exists "Users can update own avatars" on storage.objects;
  drop policy if exists "Users can delete own avatars" on storage.objects;
exception
  when undefined_table then
    -- storage.objects テーブルが存在しない場合は無視
    null;
end $$;

-- avatars バケット削除
-- 注意: Storage バケットは SQL から直接削除できません。
--       Supabase Dashboard > Storage > avatars バケット > Settings > Delete bucket
--       から手動で削除してください。
--       または、バケットをそのまま残しても問題ありません（001_init.sql が自動でスキップします）
