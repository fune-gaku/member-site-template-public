-- Issue #41: handle_new_user() の search_path を '' に固定
--
-- 既存定義 (20260420205000_init.sql:73-84) との差分は
-- `set search_path = public` → `set search_path = ''` のみ。
-- 関数本体は既に public.profiles で完全修飾されているため挙動は不変、
-- 将来の編集者が unqualified な参照を増やしたときのフェイルセーフとして
-- empty search_path を採用する (Supabase 公式推奨)。
--
-- 公式: https://supabase.com/docs/guides/database/functions
-- 教科書版 RBAC ガイドの authorize() も同様に `set search_path = ''` を採用。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;
