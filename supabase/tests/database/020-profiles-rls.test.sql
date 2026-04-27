-- ========================================
-- profiles テーブル RLS のテスト
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   - alter table public.profiles enable row level security;
--   - "Users can view own profile" (select using auth.uid() = user_id)
--   - "Users can update own profile" (update using auth.uid() = user_id)
--
-- 退行検出: いずれかのポリシーをコメントアウトすると該当テストが fail する。
--
-- 注意: profiles テーブルの INSERT / DELETE は RLS ポリシー無し = 全拒否。
-- INSERT は handle_new_user トリガー (security definer) 経由でのみ発生する。
-- DELETE は auth.users への ON DELETE CASCADE 経由でのみ発生する。

begin;
select plan(5);

-- セットアップ: 2 ユーザー作成 (各々 profiles 行が自動生成される)
select tests.create_supabase_user('alice@example.com');
select tests.create_supabase_user('bob@example.com');

-- ----------------------------------------
-- Test 1: 自分のプロフィールは SELECT 可能
-- ----------------------------------------
select tests.authenticate_as('alice@example.com');

select results_eq(
  $$ select user_id from public.profiles $$,
  $$ select tests.get_supabase_uid('alice@example.com') $$,
  'authenticated は自分の profiles 行のみ SELECT できる (他ユーザーは RLS で不可視)'
);

-- ----------------------------------------
-- Test 2: 他ユーザーの user_id を WHERE 指定しても 0 行
-- ----------------------------------------
select results_eq(
  format(
    $$ select count(*)::int from public.profiles where user_id = %L $$,
    tests.get_supabase_uid('bob@example.com')
  ),
  $$ values (0) $$,
  'authenticated が他ユーザーの user_id を直接指定しても RLS で 0 行に絞られる'
);

-- ----------------------------------------
-- Test 3: 自分の display_name は UPDATE 可能
-- ----------------------------------------
select lives_ok(
  $$ update public.profiles set display_name = 'alice updated' where user_id = (select auth.uid()) $$,
  '自分の display_name は UPDATE できる'
);

select is(
  (select display_name from public.profiles where user_id = (select auth.uid())),
  'alice updated'::text,
  'UPDATE 結果が反映されている'
);

-- ----------------------------------------
-- Test 4: 他ユーザーの行を UPDATE しようとしても 0 行 (RLS using で弾かれる)
-- ----------------------------------------
-- CTE with RETURNING で affected row 数を捕捉する。do block 内の
-- `perform is(...)` は TAP 出力しないため使わない。
with upd as (
  update public.profiles set display_name = 'hacked'
   where user_id = tests.get_supabase_uid('bob@example.com')
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  '他ユーザーの行への UPDATE は 0 rows (RLS using で弾かれる)'
);

select * from finish();
rollback;
