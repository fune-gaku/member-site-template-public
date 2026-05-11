-- ========================================
-- auth.users 削除時の cascade テスト (Issue #14, admin-only)
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   create table public.profiles (
--     user_id uuid not null primary key
--       references auth.users(id) on delete cascade,
--     ...
--   );
--   create table public.member_posts (
--     ...
--     user_id uuid not null
--       references auth.users(id) on delete cascade,
--     ...
--   );
--
-- admin.deleteUser Action は `auth.admin.deleteUser(userId, false)` を呼んで
-- auth.users から hard delete する。本テストは DB レイヤだけを切り出し、
-- auth.users から行を消したときに子テーブル (profiles / member_posts) が
-- cascade で連鎖削除されることを固定する。
--
-- 退行検出: 子テーブルの FK を on delete no action / set null / restrict に
-- 変えると、auth.users 削除が FK 違反で失敗するか子行が孤児として残る
-- → このテストが fail する。

begin;
select plan(4);

-- ----------------------------------------
-- セットアップ: alice 作成 + post 1 件
--   handle_new_user トリガが発火して profiles も同 user_id で 1 行作成される。
-- ----------------------------------------
select tests.create_supabase_user('alice@example.com');
insert into public.member_posts (user_id, title, body)
values (
  tests.get_supabase_uid('alice@example.com'),
  'alice post',
  'private body'
);

-- ----------------------------------------
-- Test 1+2: 事前条件 (子行が存在することを固定)
-- ----------------------------------------
select is(
  (select count(*)::int from public.profiles
    where user_id = tests.get_supabase_uid('alice@example.com')),
  1,
  '事前条件: profiles に alice の行が 1 件 (handle_new_user で自動作成済み)'
);

select is(
  (select count(*)::int from public.member_posts
    where user_id = tests.get_supabase_uid('alice@example.com')),
  1,
  '事前条件: member_posts に alice の行が 1 件'
);

-- ----------------------------------------
-- alice の uid を transaction-local config に保存
--   auth.users 削除後は tests.get_supabase_uid('alice@example.com') が
--   NULL を返すため、削除後の検証クエリでは current_setting 経由で参照する。
-- ----------------------------------------
do $$
begin
  perform set_config(
    'tests.alice_id',
    tests.get_supabase_uid('alice@example.com')::text,
    true
  );
end $$;

-- auth.users から alice を削除 (cascade で子行も連鎖削除されるはず)
delete from auth.users
 where id = current_setting('tests.alice_id')::uuid;

-- ----------------------------------------
-- Test 3: profiles の alice 行が cascade 削除される
-- ----------------------------------------
select is(
  (select count(*)::int from public.profiles
    where user_id = current_setting('tests.alice_id')::uuid),
  0,
  'auth.users 削除で profiles の alice 行が cascade 削除される (on delete cascade)'
);

-- ----------------------------------------
-- Test 4: member_posts の alice 行が cascade 削除される
-- ----------------------------------------
select is(
  (select count(*)::int from public.member_posts
    where user_id = current_setting('tests.alice_id')::uuid),
  0,
  'auth.users 削除で member_posts の alice 行が cascade 削除される (on delete cascade)'
);

select * from finish();
rollback;
