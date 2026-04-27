-- ========================================
-- member_posts テーブル RLS のテスト
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   - alter table public.member_posts enable row level security;
--   - "Users can view own posts"   (select using auth.uid() = user_id)
--   - "Users can insert own posts" (insert with check auth.uid() = user_id)
--   - "Users can update own posts" (update using auth.uid() = user_id)
--   - "Users can delete own posts" (delete using auth.uid() = user_id)
--
-- 退行検出: いずれかのポリシーをコメントアウトすると該当テストが fail。

begin;
select plan(8);

-- ----------------------------------------
-- 設計ノート (Codex iteration 1 P1 finding 1):
--   negative-only な assertion (例: bob は alice の post を見れない = 0 行)
--   は、対応 policy 自体を **消した** 場合でも default-deny + 0 rows で
--   green のままになり、own-row の正常系を壊す regression を見逃す。
--   Test 6/7/8 で alice 自身の SELECT/UPDATE/DELETE 正常動作を positive
--   assertion として固定する。
-- ----------------------------------------

-- セットアップ: alice, bob 作成。alice の post を 1 件 (postgres 権限で直接 insert)
select tests.create_supabase_user('alice@example.com');
select tests.create_supabase_user('bob@example.com');

insert into public.member_posts (user_id, title, body)
values (tests.get_supabase_uid('alice@example.com'), 'alice secret', 'private');

-- ----------------------------------------
-- Test 1: 自分の post を INSERT できる (with check 通過)
-- ----------------------------------------
select tests.authenticate_as('alice@example.com');

select lives_ok(
  $$ insert into public.member_posts (user_id, title) values ((select auth.uid()), 'self post') $$,
  'authenticated は自分の post を INSERT できる'
);

-- ----------------------------------------
-- Test 2: 他ユーザーの user_id で INSERT しようとすると with check 違反
-- ----------------------------------------
select throws_ok(
  format(
    $$ insert into public.member_posts (user_id, title) values (%L, 'spoofed') $$,
    tests.get_supabase_uid('bob@example.com')
  ),
  '42501',
  null,
  '他ユーザーの user_id を詰めた INSERT は RLS with check 違反で 42501'
);

-- ----------------------------------------
-- Test 3: bob は alice の post を SELECT できない
-- ----------------------------------------
select tests.authenticate_as('bob@example.com');

select results_eq(
  $$ select count(*)::int from public.member_posts $$,
  $$ values (0) $$,
  'bob は他ユーザーの post を SELECT できない (alice の 2 件は不可視)'
);

-- ----------------------------------------
-- Test 4: bob は alice の post を UPDATE できない (0 rows)
-- ----------------------------------------
with upd as (
  update public.member_posts set title = 'hijacked'
   where user_id = tests.get_supabase_uid('alice@example.com')
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  '他ユーザーの post への UPDATE は 0 rows'
);

-- ----------------------------------------
-- Test 5: bob は alice の post を DELETE できない (0 rows)
-- ----------------------------------------
with del as (
  delete from public.member_posts
   where user_id = tests.get_supabase_uid('alice@example.com')
  returning 1
)
select is(
  (select count(*)::int from del),
  0,
  '他ユーザーの post への DELETE は 0 rows'
);

-- ----------------------------------------
-- Test 6 (positive): alice は自分の post を SELECT できる
-- ----------------------------------------
-- SELECT ポリシー自体が消されると 0 rows になり、Test 3 の negative
-- assertion はそれでも green のまま通ってしまう。alice 視点で 2 件以上
-- (setup での 1 件 + Test 1 の 1 件) 見えることを固定する。
select tests.authenticate_as('alice@example.com');

select is(
  (select count(*)::int from public.member_posts),
  2,
  'alice は自分の post を SELECT できる (Test 1 で insert した 1 件 + setup の 1 件)'
);

-- ----------------------------------------
-- Test 7 (positive): alice は自分の post を UPDATE できる
-- ----------------------------------------
-- UPDATE ポリシーが消されると alice の自己更新も 0 rows になる
-- → このテストが fail する。
with upd as (
  update public.member_posts set title = 'edited'
   where user_id = (select auth.uid())
  returning 1
)
select cmp_ok(
  (select count(*)::int from upd),
  '>=',
  1,
  'alice は自分の post を UPDATE できる (>=1 row affected)'
);

-- ----------------------------------------
-- Test 8 (positive): alice は自分の post を DELETE できる
-- ----------------------------------------
-- DELETE ポリシーが消されると alice の自己削除も 0 rows になる
-- → このテストが fail する。
with del as (
  delete from public.member_posts
   where user_id = (select auth.uid())
  returning 1
)
select cmp_ok(
  (select count(*)::int from del),
  '>=',
  1,
  'alice は自分の post を DELETE できる (>=1 row deleted)'
);

select * from finish();
rollback;
