-- ========================================
-- profiles.display_name CHECK 制約のテスト (Issue #007 多層防御)
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   constraint profiles_display_name_length
--     check (display_name is null or char_length(display_name) <= 100)
--
-- 退行検出: CHECK 制約を削除 / 上限を緩めると該当テストが fail。

begin;
select plan(3);

select tests.create_supabase_user('alice@example.com');

-- ----------------------------------------
-- Test 1: 100 文字ちょうどは通る (境界値 ≤ 100)
-- ----------------------------------------
select lives_ok(
  format(
    $$ update public.profiles set display_name = %L
       where user_id = %L $$,
    repeat('a', 100),
    tests.get_supabase_uid('alice@example.com')
  ),
  '100 文字ちょうどの display_name は CHECK を通過する'
);

-- ----------------------------------------
-- Test 2: 101 文字は CHECK 違反 (23514 = check_violation)
-- ----------------------------------------
select throws_ok(
  format(
    $$ update public.profiles set display_name = %L
       where user_id = %L $$,
    repeat('a', 101),
    tests.get_supabase_uid('alice@example.com')
  ),
  '23514',
  null,
  '101 文字の display_name は CHECK 制約違反 (check_violation)'
);

-- ----------------------------------------
-- Test 3: NULL は許可 (CHECK の "display_name is null or" 部分)
-- ----------------------------------------
select lives_ok(
  format(
    $$ update public.profiles set display_name = NULL
       where user_id = %L $$,
    tests.get_supabase_uid('alice@example.com')
  ),
  'NULL は CHECK を通過する (登録直後のデフォルト状態を許容)'
);

select * from finish();
rollback;
