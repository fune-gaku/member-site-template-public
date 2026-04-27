-- ========================================
-- handle_new_user() トリガーのテスト
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   create or replace function public.handle_new_user()
--     returns trigger language plpgsql security definer set search_path = public
--   - auth.users への INSERT で発火
--   - public.profiles に同 user_id で行を作成
--   - display_name は raw_user_meta_data->>'display_name' (なければ '')
--
-- 退行検出: トリガーをドロップ / 関数を no-op にすると該当テストが fail。
--
-- 実装ノート: pgTAP の `select is(...)` は文 (statement) 単位で TAP 出力する。
-- do-block 内の `perform is(...)` は TAP 出力しないため、固定 UUID で
-- INSERT してから平の select is(...) で検証する。

begin;
select plan(4);

-- ----------------------------------------
-- Test 1+2: raw_user_meta_data に display_name 有り
-- ----------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'with-name@example.com',
  extensions.crypt('p', extensions.gen_salt('bf')),
  now(), '{}'::jsonb, '{"display_name":"Alice"}'::jsonb,
  now(), now(), '', '', '', ''
);

select is(
  (select count(*)::int from public.profiles
    where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'auth.users INSERT で profiles 行が自動作成される (display_name 有り)'
);

select is(
  (select display_name from public.profiles
    where user_id = '11111111-1111-1111-1111-111111111111'),
  'Alice'::text,
  'raw_user_meta_data の display_name が profiles に転記される'
);

-- ----------------------------------------
-- Test 3+4: raw_user_meta_data なし (display_name は空文字にフォールバック)
-- ----------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'no-name@example.com',
  extensions.crypt('p', extensions.gen_salt('bf')),
  now(), '{}'::jsonb, '{}'::jsonb,
  now(), now(), '', '', '', ''
);

select is(
  (select count(*)::int from public.profiles
    where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'meta data 空でも profiles 行が作られる'
);

select is(
  (select display_name from public.profiles
    where user_id = '22222222-2222-2222-2222-222222222222'),
  ''::text,
  'meta data に display_name 無しの場合は空文字にフォールバック'
);

select * from finish();
rollback;
