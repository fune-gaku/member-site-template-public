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
--   - **grant all on user_roles to service_role 削除 → Test 8/9/10 が fail**
--     (Codex review iteration-1 P1: clear_authentication だけでは postgres 権限で
--      通ってしまうため、010-profiles-role-revoke.test.sql Test 3 と同じく
--      `set local role service_role` で実 service_role 権限を行使する)
--   - data migration 削除 → Test 6 が fail
--   - data migration の insert に汚れ (余分な行) が入ると → Test 7 が fail
--     (Codex review iteration-1 P2: 一方向 join では余分な user_roles 行を見逃す
--      ため、profiles ⇄ user_roles の双方向 anti-join で検証する)

begin;
select plan(12);

-- ----------------------------------------
-- Setup: alice (member) + bob (admin) を作成
--   tests.create_supabase_user は handle_new_user を発火させるため、
--   profiles と user_roles の両方に member 行が作られる。
--   bob を admin に昇格させるため profiles.role のみを更新する
--   (Codex review iteration-2: profiles.role → user_roles の sync trigger が
--    自動で user_roles 行も更新する。本番の admin.updateUserRole 経路と同じ。)
-- ----------------------------------------
select tests.create_supabase_user('alice@example.com');
select tests.create_supabase_user('bob@example.com');

-- bob を admin に昇格 (本来は admin.updateUserRole Action 経由 / service_role)
-- profiles.role の UPDATE が sync_profiles_role_to_user_roles trigger を発火させ、
-- user_roles 側も自動的に bob/admin に更新される。
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

-- ----------------------------------------
-- Test 6: data migration parity (forward = profiles → user_roles)
--   profiles.role がある全行に対応する user_roles 行が存在することを anti-join で検証。
--   退行検出: data migration の INSERT を消すと該当行が user_roles に無くなり fail。
-- ----------------------------------------
select is(
  (select count(*)::int from public.profiles p
    where p.role is not null
      and not exists (
        select 1 from public.user_roles ur
         where ur.user_id = p.user_id
           and ur.role = p.role::public.app_role
      )),
  0,
  'data parity (forward): profiles.role に対応する user_roles 行が漏れていない'
);

-- ----------------------------------------
-- Test 7: data migration parity (backward = user_roles → profiles)
--   user_roles に profiles.role と一致しない余分な行が無いことを anti-join で検証。
--   Phase 1 では user_roles は profiles.role と完全一致する invariant を持つ
--   (Phase 2 で profiles.role drop までの一時的契約)。
--   Codex review iteration-1 P2: 一方向 count 比較では余分な user_roles 行を
--   見逃す bug を防ぐため双方向で検証する。
--
--   この Test は service_role CRUD (Test 8-10) の **前** に走らせる。
--   後続 CRUD で意図的に状態を変えるため、parity 検証は変更前の状態でだけ意味を持つ。
-- ----------------------------------------
select is(
  (select count(*)::int from public.user_roles ur
    where not exists (
      select 1 from public.profiles p
       where p.user_id = ur.user_id
         and p.role::public.app_role = ur.role
    )),
  0,
  'data parity (backward): user_roles に余分な行が無い (Phase 1 invariant)'
);

-- ----------------------------------------
-- Test 8-10: service_role の CRUD 検証 (grant all on user_roles to service_role)
--   admin.updateUserRole Action は service_role で動くため、ここが通ることが必須。
--   `set local role service_role` で実 service_role 権限を行使する
--   (010-profiles-role-revoke.test.sql Test 3 と同じパターン)。
--   `tests.clear_authentication()` だけでは postgres 権限に戻るだけで
--   superuser bypass のため grant 検証にならない (Codex review iteration-1 P1)。
-- ----------------------------------------
select tests.clear_authentication();
set local role service_role;

-- Test 8: INSERT
-- alice に admin 行を追加 (alice/member は既存)。on conflict do nothing で
-- idempotent。本番の admin.updateUserRole の挙動に近い。
select lives_ok(
  format(
    $$ insert into public.user_roles (user_id, role)
       values (%L, 'admin'::public.app_role)
       on conflict (user_id, role) do nothing $$,
    tests.get_supabase_uid('alice@example.com')
  ),
  'service_role: user_roles に INSERT できる (grant all 検証)'
);

-- Test 9: UPDATE
-- bob/admin の role を一時的に member に変える。
-- (bob/admin は setup で既に存在。member への UPDATE は (user_id, role) の
--  unique constraint に違反しない: bob/member 行が無いため。)
select lives_ok(
  format(
    $$ update public.user_roles
         set role = 'member'::public.app_role
       where user_id = %L and role = 'admin'::public.app_role $$,
    tests.get_supabase_uid('bob@example.com')
  ),
  'service_role: user_roles を UPDATE できる (grant all 検証)'
);

-- Test 10: DELETE
-- Test 8 で INSERT した alice/admin を削除する。
-- これで grant all の DML 3 種 (INSERT/UPDATE/DELETE) が網羅される。
select lives_ok(
  format(
    $$ delete from public.user_roles
       where user_id = %L and role = 'admin'::public.app_role $$,
    tests.get_supabase_uid('alice@example.com')
  ),
  'service_role: user_roles を DELETE できる (grant all 検証)'
);

-- ----------------------------------------
-- Test 11: profiles.role 同期 trigger (Codex review iteration-2 P2)
--   Phase 1 では admin.updateUserRole が profiles.role のみを更新するため、
--   sync_profiles_role_to_user_roles trigger が user_roles を自動同期する必要がある。
--   ここでは alice (現在 user_roles=member) を profiles 経由で admin に昇格させ、
--   user_roles が trigger によって member → admin に書き換わることを直接固定する。
--
--   退行検出: trigger を drop すると user_roles に古い member 行が残り、
--   admin 行が追加されないため、count != 1 / role != admin で fail する。
-- ----------------------------------------
update public.profiles
   set role = 'admin'
 where user_id = tests.get_supabase_uid('alice@example.com');

select is(
  (select count(*)::int from public.user_roles
    where user_id = tests.get_supabase_uid('alice@example.com')),
  1,
  'sync trigger: profiles.role UPDATE 後も user_roles 行は 1 件 (旧 member 削除済)'
);

select is(
  (select role::text from public.user_roles
    where user_id = tests.get_supabase_uid('alice@example.com')),
  'admin',
  'sync trigger: profiles.role を admin に変更すると user_roles も admin に同期'
);

select * from finish();
rollback;
