-- ========================================
-- public.user_roles RLS / 権限剥奪テスト (Issue #42 Phase 1)
-- ========================================
-- 検証対象 (20260506160000_user_roles_table.sql):
--   - alter table public.user_roles enable row level security;
--   - create policy "Users can view own role" ... using (auth.uid() = user_id)
--   - revoke all on public.user_roles from authenticated;
--   - grant select on public.user_roles to authenticated;
--   - grant all on public.user_roles to service_role;
--   - data migration (profiles.role -> user_roles)
--   - handle_new_user() の user_roles INSERT (このファイルでは 050 の結果に依存)
--
-- 退行検出:
--   - SELECT policy 削除 → Test 1 が fail (default-deny で 0 行)
--   - revoke all 削除 → Test 3/4/5 が fail (INSERT/UPDATE/DELETE が通ってしまう)
--   - data migration 削除 → Test 7 が fail (profiles.role と user_roles の数が一致しない)

begin;
select plan(7);

-- ----------------------------------------
-- Setup: alice (member) + bob (admin) を作成
--   tests.create_supabase_user は handle_new_user を発火させるため、
--   profiles と user_roles の両方に member 行が作られる。
--   bob を admin に昇格させるため service_role 相当 (postgres) で role を上書き。
-- ----------------------------------------
select tests.create_supabase_user('alice@example.com');
select tests.create_supabase_user('bob@example.com');

-- bob を admin に昇格させる (本来は admin.updateUserRole Action 経由 / service_role)
-- handle_new_user で挿入された 'member' 行を 'admin' に書き換える。
update public.user_roles
   set role = 'admin'::public.app_role
 where user_id = tests.get_supabase_uid('bob@example.com');

-- profiles.role 側も整合性のため admin に揃える (Phase 1 では profiles.role が
-- 真の情報源として残るため、data migration parity を assert する Test 7 で必要)。
update public.profiles
   set role = 'admin'
 where user_id = tests.get_supabase_uid('bob@example.com');

-- ----------------------------------------
-- Test 1 (positive): alice は自分の role 行を SELECT できる
--   default-deny + SELECT policy が両方無いと 0 行になりこのテストが fail。
-- ----------------------------------------
select tests.authenticate_as('alice@example.com');

select is(
  (select count(*)::int from public.user_roles
    where user_id = (select auth.uid())),
  1,
  'authenticated: 自分の role 行を SELECT できる'
);

-- ----------------------------------------
-- Test 2 (negative): alice は bob の role 行を SELECT できない
--   user_id = auth.uid() の RLS により bob の行は 0 行で返る。
-- ----------------------------------------
select is(
  (select count(*)::int from public.user_roles
    where user_id = tests.get_supabase_uid('bob@example.com')),
  0,
  'authenticated: 他人の role 行は SELECT 不可 (RLS で 0 行)'
);

-- ----------------------------------------
-- Test 3: authenticated は INSERT できない (table-level revoke)
--   RLS の with check 以前に table-level 権限が無いため 42501。
-- ----------------------------------------
select throws_ok(
  $$ insert into public.user_roles (user_id, role)
     values ((select auth.uid()), 'admin'::public.app_role) $$,
  '42501',
  null,
  'authenticated: user_roles に INSERT すると 42501 (table-level revoke)'
);

-- ----------------------------------------
-- Test 4: authenticated は UPDATE できない (table-level revoke)
--   自分の行であっても権限が無いので 42501。これにより role の自己昇格を防ぐ。
-- ----------------------------------------
select throws_ok(
  $$ update public.user_roles
        set role = 'admin'::public.app_role
      where user_id = (select auth.uid()) $$,
  '42501',
  null,
  'authenticated: user_roles を UPDATE すると 42501 (自己昇格防止)'
);

-- ----------------------------------------
-- Test 5: authenticated は DELETE できない (table-level revoke)
-- ----------------------------------------
select throws_ok(
  $$ delete from public.user_roles where user_id = (select auth.uid()) $$,
  '42501',
  null,
  'authenticated: user_roles を DELETE すると 42501'
);

-- 認証コンテキストを postgres (= service_role 相当) に戻す
select tests.clear_authentication();

-- ----------------------------------------
-- Test 6 (positive): service_role (postgres) は INSERT/UPDATE/DELETE できる
--   admin.updateUserRole Action は service_role で書き換えるため、ここが通る
--   ことが必須。lives_ok で全 CRUD を 1 ケースで検証する。
-- ----------------------------------------
select lives_ok(
  $$ insert into public.user_roles (user_id, role)
       values (tests.get_supabase_uid('alice@example.com'),
               'admin'::public.app_role)
     on conflict (user_id, role) do nothing $$,
  'service_role: user_roles に INSERT できる (on conflict do nothing で idempotent)'
);

-- ----------------------------------------
-- Test 7: data migration parity
--   profiles.role が ('member', 'admin') で値を持つ行は user_roles にも
--   同じ user_id + 同じ role で存在する。
--   退行検出: data migration の INSERT を消すと user_roles 側が空になり fail。
-- ----------------------------------------
select is(
  (select count(*)::int
     from public.profiles p
     join public.user_roles ur
       on p.user_id = ur.user_id
      and p.role::public.app_role = ur.role),
  (select count(*)::int from public.profiles where role is not null),
  'data migration: profiles.role と user_roles の (user_id, role) 組が一致'
);

select * from finish();
rollback;
