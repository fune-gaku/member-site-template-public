-- ========================================
-- pgTAP セットアップ + 最小テストヘルパー
-- ========================================
-- このファイルは `supabase test db` 実行時に最初にロードされる。
-- pgTAP 拡張を install し、tests スキーマに最小限のヘルパーを定義する。
--
-- 設計方針 (Issue #35):
--   - basejump-supabase_test_helpers (dbdev) には依存しない:
--       * 外部レジストリ (dbdev) の可用性に CI が引きずられないようにする
--       * バージョン固定とアップグレード追従の運用コストを回避
--       * 必要なヘルパーは 4 つだけなので自前で書いた方が読みやすい
--   - basejump 互換のシグネチャを意図的に踏襲し、将来 dbdev へ移行しても
--     テストファイル側を書き換えずに済むようにする
--
-- 提供するヘルパー (すべて tests スキーマ):
--   - tests.create_supabase_user(identifier text) returns uuid
--   - tests.get_supabase_uid(identifier text) returns uuid
--   - tests.authenticate_as(identifier text) returns void
--   - tests.clear_authentication() returns void
--
-- 各テストファイル冒頭の begin; ... rollback; で完全に巻き戻るため、
-- ユーザーの後始末は不要。

-- pgTAP / tests スキーマ / ヘルパー関数の install は **transaction wrap しない**:
-- pg_prove は各 .sql ファイルを独立した transaction で評価するため、
-- ここで begin/rollback すると後続ファイルからヘルパーが見えなくなる。
-- DDL を直接走らせて persist させ、最後に no_plan() でファイル全体を
-- TAP-compliant にしている。

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- ヘルパーは authenticated や service_role に切り替えた後でも呼べる必要がある
-- (例: 010 で authenticated として exploit を試した後に clear_authentication で
--  postgres に戻る、など)。tests スキーマと中の関数全部に USAGE / EXECUTE を許可。
grant usage on schema tests to postgres, anon, authenticated, service_role;

-- ----------------------------------------
-- tests.create_supabase_user(identifier)
-- ----------------------------------------
-- auth.users にテストユーザーを作成し、生成された uuid を返す。
-- `identifier` は email として使い、後で authenticate_as / get_supabase_uid
-- が同じ identifier で参照する。
--
-- on_auth_user_created トリガー (handle_new_user) が発火し、
-- public.profiles に行が作られる前提。
create or replace function tests.create_supabase_user(identifier text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    identifier,
    crypt('password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );
  return user_id;
end;
$$;

-- ----------------------------------------
-- tests.get_supabase_uid(identifier)
-- ----------------------------------------
-- SECURITY DEFINER: caller が authenticated / service_role 等で auth.users を
-- 読めない状況でも、関数所有者 (postgres) 権限で uid 解決できるようにする。
-- search_path = pg_catalog, public でスキーマインジェクションを防ぐ。
create or replace function tests.get_supabase_uid(identifier text)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select id from auth.users where email = identifier;
$$;

-- ----------------------------------------
-- tests.authenticate_as(identifier)
-- ----------------------------------------
-- 現在のセッションを authenticated ロール + 指定ユーザーの JWT claims に
-- 切り替える。auth.uid() / auth.jwt() がこのユーザーを返すようになる。
--
-- 切り替えは set_config(..., true) で transaction-scoped にしているため、
-- begin; ... rollback; の境界を超えない。
-- 内部 helper: auth.users を読んで JWT claims を構築する。
-- SECURITY DEFINER で auth.users への SELECT を担保。authenticate_as は
-- set_config('role', ...) を呼ぶ都合で SECURITY DEFINER にできない
-- (PostgreSQL が "cannot set parameter "role" within security-definer function"
-- で拒否するため) ので、claims 構築だけを別関数に切り出す。
create or replace function tests._build_jwt_claims(identifier text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_build_object(
    'sub', id::text,
    'email', email,
    'role', 'authenticated',
    'aud', 'authenticated',
    'user_metadata', raw_user_meta_data,
    'app_metadata', raw_app_meta_data
  )
  from auth.users
  where email = identifier;
$$;

create or replace function tests.authenticate_as(identifier text)
returns void
language plpgsql
as $$
declare
  user_data jsonb;
begin
  user_data := tests._build_jwt_claims(identifier);

  if user_data is null then
    raise exception 'tests.authenticate_as: user with identifier % not found', identifier;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', user_data::text, true);
end;
$$;

-- ----------------------------------------
-- tests.clear_authentication()
-- ----------------------------------------
-- ロールと JWT claims を初期状態に戻す (postgres スーパーユーザー)。
-- 別ユーザーに切り替える前に呼ぶ必要は無い (authenticate_as が上書きする) が、
-- RLS を無視して setup したいときに使う。
create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- 各関数も全 role に EXECUTE 許可 (authenticated 切替後も呼べるように)
grant execute on all functions in schema tests
  to postgres, anon, authenticated, service_role;

-- ----------------------------------------
-- pg_prove 互換のための TAP marker
-- ----------------------------------------
-- pg_prove は各ファイルに plan を要求する。setup ファイルにはアサーションが
-- 無いため no_plan() + finish() で空の TAP 出力にする。
select no_plan();
select pass('tests helpers installed');
select * from finish();
