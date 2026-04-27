-- ========================================
-- 権限昇格 (Privilege Escalation) 防止のテスト
-- ========================================
-- 検証対象:
--   `revoke update (role) on public.profiles from authenticated;`
--   (20260420205000_init.sql)
--
-- なぜテストする:
--   一般ユーザー (authenticated) が自分の `role` を 'member' から 'admin' に
--   書き換えられると **管理画面 (/admin/*) を支配される**。RLS だけでは
--   `using ((select auth.uid()) = user_id)` を満たす自分の行に対しては
--   UPDATE が通ってしまう。column-level GRANT/REVOKE は RLS より先に
--   評価されるため、より堅牢な防御層となる。
--
-- 退行検出の確認方法:
--   init.sql の `revoke update (role) on public.profiles from authenticated;`
--   の行をコメントアウトすると test 1 が fail することを確認 (Issue #35
--   acceptance criteria)。

begin;
select plan(3);

-- セットアップ: 一般ユーザーを作成 (handle_new_user トリガーで profiles 行も生成される)
select tests.create_supabase_user('user-a@example.com');

-- ----------------------------------------
-- Test 1: authenticated が自分の role を書き換えられない
-- ----------------------------------------
-- 期待: column-level revoke により permission denied (SQLSTATE 42501)
select tests.authenticate_as('user-a@example.com');

select throws_ok(
  $$ update public.profiles set role = 'admin' where user_id = (select auth.uid()) $$,
  '42501',
  null,
  'authenticated は自分の profiles.role を UPDATE できない (column-level revoke が効く)'
);

-- ----------------------------------------
-- Test 2: 他のカラムは authenticated でも UPDATE できる (RLS の範囲内)
-- ----------------------------------------
-- 退行検出: 万が一 revoke update on profiles (全カラム) と書き間違えて
-- 一般カラムまで触れなくなったら、機能が壊れたことに気付ける。
select lives_ok(
  $$ update public.profiles set display_name = 'updated' where user_id = (select auth.uid()) $$,
  'authenticated は自分の display_name を UPDATE できる (revoke の範囲は role 列のみ)'
);

-- ----------------------------------------
-- Test 3: service_role は明示 grant により role を UPDATE できる
-- ----------------------------------------
-- init.sql の `grant update on public.profiles to service_role;` を検証。
-- admin.updateUserRole Action が service_role 経由で動く前提。
select tests.clear_authentication();
set local role service_role;

select lives_ok(
  format(
    $$ update public.profiles set role = 'admin' where user_id = %L $$,
    tests.get_supabase_uid('user-a@example.com')
  ),
  'service_role は profiles.role を UPDATE できる (明示 grant が効く)'
);

select * from finish();
rollback;
