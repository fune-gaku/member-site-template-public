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
select plan(10);

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

-- ----------------------------------------
-- Test 5+6+7: Google OAuth 経由の signup を模した meta_data (Issue #49)
--   raw_user_meta_data には Google OIDC userinfo が並ぶ:
--     - name / full_name / iss / sub 等
--   ただし `display_name` キーは含まれない。
--   raw_app_meta_data には provider="google" と providers=["google"] が入る。
-- 本テンプレートの handle_new_user は `display_name` キーのみ参照するため、
-- Google OAuth 経由のユーザは display_name が空文字になる仕様（後追いで
-- ユーザが /member/profile から編集する想定）。トリガが落ちないこと + role が
-- default の 'member' になることを保証する。
-- ----------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated', 'oauth-google@example.com',
  '',  -- OAuth ユーザは encrypted_password を持たない
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"iss":"https://accounts.google.com","name":"Bob Smith","full_name":"Bob Smith","email":"oauth-google@example.com","email_verified":true,"avatar_url":"https://lh3.googleusercontent.com/test","provider_id":"108888888888888888888","sub":"108888888888888888888"}'::jsonb,
  now(), now(), '', '', '', ''
);

select is(
  (select count(*)::int from public.profiles
    where user_id = '33333333-3333-3333-3333-333333333333'),
  1,
  'OAuth-shaped raw_user_meta_data でも profiles 行が作られる (Issue #49)'
);

select is(
  (select display_name from public.profiles
    where user_id = '33333333-3333-3333-3333-333333333333'),
  ''::text,
  'OAuth: display_name キー無しは空文字フォールバック (name/full_name は転記しない仕様)'
);

select is(
  (select role from public.profiles
    where user_id = '33333333-3333-3333-3333-333333333333'),
  'member'::text,
  'OAuth signup でも role は default の member（昇格は service_role 経由のみ）'
);

-- ----------------------------------------
-- Test 8+9+10: SECURITY DEFINER 関数の REST 公開遮断 (Issue #27, lint 0028/0029)
--   auth.users INSERT トリガー専用なので anon / authenticated / PUBLIC からは
--   EXECUTE できないことを保証する。`has_function_privilege` は PUBLIC 経由でも
--   true を返すため、PUBLIC からも剥奪されていることを併せて検証する。
-- ----------------------------------------
select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'anon は public.handle_new_user() を EXECUTE できない (lint 0028)'
);

select is(
  has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'authenticated は public.handle_new_user() を EXECUTE できない (lint 0029)'
);

select is(
  has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'PUBLIC からも EXECUTE が剥奪されている (anon/authenticated への有効な剥奪条件)'
);

select * from finish();
rollback;
