-- ========================================
-- Before User Created Hook + auth_allowed_email_domains のテスト (Issue #11)
-- ========================================
-- 検証対象 (20260520001905_add_email_domain_allowlist.sql):
--   - public.auth_allowed_email_domains テーブル (PK + CHECK + RLS + revoke)
--   - public.before_user_created_restrict_email_domain(event jsonb) returns jsonb
--   - grant execute to supabase_auth_admin
--   - revoke execute from public, anon, authenticated
--
-- 関数の戻り値仕様 (Supabase 公式):
--   - 許可: '{}'::jsonb
--   - 拒否: {"error": {"message": "...", "http_code": 403}}
--
-- 退行検出:
--   - allowlist 空 → 許可ロジック削除 → Test 1 が fail
--   - hd claim 優先削除 → Test 5 が fail
--   - lower() 削除 → Test 6 が fail
--   - email 欠損ガード削除 → Test 7 が fail
--   - CHECK 制約削除 → Test 8 が fail (uppercase INSERT が通ってしまう)
--   - revoke execute 削除 → Test 9 が fail (anon/authenticated が EXECUTE できてしまう)
--   - alter table ... enable row level security 削除 → Test 10 が fail
--   - revoke all on auth_allowed_email_domains from authenticated 削除 → Test 11-14 が fail
--   - revoke all on auth_allowed_email_domains from anon 削除 → Test 15-18 が fail
--   - hd 抽出ループで provider='google' ガード削除 (Codex iter-1 P1 修正) → Test 20 が fail
--   - deny_all_to_authenticated_and_anon policy 削除 (20260520070025_*.sql) → Test 21 が fail

begin;
select plan(25);

-- 関数の許可/拒否の戻り値を共通化 (テスト内では rejection の JSON を毎回手書きしない)
-- ※ Test setup の前に定義しておく
create or replace function pg_temp.expected_rejection()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'このドメインのアカウントではサインインできません',
      'http_code', 403
    )
  );
$$;

-- ----------------------------------------
-- Test 1: allowlist 空 → 任意 email で許可
-- ----------------------------------------
-- 既定状態 (テーブル空) では backward-compat のため無制限に許可される。
select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'anyone@anywhere.example'))
  ),
  '{}'::jsonb,
  'allowlist 空: 任意 email で許可される (テンプレ既定の backward-compat)'
);

-- ----------------------------------------
-- Test 2: allowlist 単一 → 一致で許可
-- ----------------------------------------
insert into public.auth_allowed_email_domains (domain) values ('example.com');

select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'user@example.com'))
  ),
  '{}'::jsonb,
  'allowlist 単一: 一致する email で許可される'
);

-- ----------------------------------------
-- Test 3: allowlist 単一 → 不一致で reject
-- ----------------------------------------
select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'user@other.com'))
  ),
  pg_temp.expected_rejection(),
  'allowlist 単一: 不一致な email は 403 で reject される'
);

-- ----------------------------------------
-- Test 4: allowlist 複数 → いずれか一致で許可 (2 件 = 2 assertion)
-- ----------------------------------------
insert into public.auth_allowed_email_domains (domain) values ('asahi-tanker.co.jp');
insert into public.auth_allowed_email_domains (domain) values ('partner-fleet.example');

select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'captain@asahi-tanker.co.jp'))
  ),
  '{}'::jsonb,
  'allowlist 複数: 1 つ目のドメインに一致で許可'
);

select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'crew@partner-fleet.example'))
  ),
  '{}'::jsonb,
  'allowlist 複数: 2 つ目のドメインに一致で許可'
);

-- ----------------------------------------
-- Test 5: Google Workspace の hd claim 優先
-- ----------------------------------------
-- email 文字列のドメインは @other.com で allowlist 不一致だが、
-- identities[0].identity_data.hd が example.com (allowlist) なら許可される。
-- ありえない逆転ケースだが、hd claim が優先される実装挙動を固定する。
select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'user@other.com',
        'identities', jsonb_build_array(
          jsonb_build_object(
            'provider', 'google',
            'identity_data', jsonb_build_object(
              'email', 'user@other.com',
              'hd', 'example.com'
            )
          )
        )
      )
    )
  ),
  '{}'::jsonb,
  'Google Workspace: identity_data.hd が allowlist 一致なら email ドメインを上書きして許可'
);

-- ----------------------------------------
-- Test 6: case-insensitive 照合
-- ----------------------------------------
-- email 側の大文字小文字に関わらず、lowercase で比較される。
select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'User@Example.COM'))
  ),
  '{}'::jsonb,
  'case-insensitive: User@Example.COM は example.com 一致で許可'
);

-- ----------------------------------------
-- Test 7: event 構造異常 → 安全側に倒して reject (2 ケース = 2 assertion)
-- ----------------------------------------
select is(
  public.before_user_created_restrict_email_domain('{}'::jsonb),
  pg_temp.expected_rejection(),
  'event に user キーが無い場合は reject (email 取得不可)'
);

select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object('user', jsonb_build_object('email', 'no-at-sign'))
  ),
  pg_temp.expected_rejection(),
  'email に @ が無い場合は reject (ドメイン抽出不可)'
);

-- ----------------------------------------
-- Test 8: CHECK 制約 → uppercase / 不正形式の INSERT が拒否される
-- ----------------------------------------
-- domain は CHECK で lowercase + DNS 風形式に固定。
-- 大文字を含む INSERT は SQLSTATE 23514 (check_violation) で失敗する。
select throws_ok(
  $$ insert into public.auth_allowed_email_domains (domain) values ('EXAMPLE.COM') $$,
  '23514',
  null,
  'CHECK 制約: uppercase ドメインの INSERT は check_violation で拒否される'
);

-- ----------------------------------------
-- Test 9: 関数 privileges (3 ロール = 3 assertion)
-- ----------------------------------------
-- REST 公開遮断: anon / authenticated / public からは EXECUTE 不可。
-- supabase_auth_admin (Auth サブシステム) からは EXECUTE 可。
-- has_function_privilege は PUBLIC 経由でも true を返すため、PUBLIC が剥奪
-- されている = anon/authenticated が実効的に剥奪されている、を併せて確認。
select is(
  has_function_privilege(
    'anon',
    'public.before_user_created_restrict_email_domain(jsonb)',
    'EXECUTE'
  ),
  false,
  'anon は before_user_created_restrict_email_domain を EXECUTE できない (REST 公開遮断)'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.before_user_created_restrict_email_domain(jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated は before_user_created_restrict_email_domain を EXECUTE できない'
);

select is(
  has_function_privilege(
    'supabase_auth_admin',
    'public.before_user_created_restrict_email_domain(jsonb)',
    'EXECUTE'
  ),
  true,
  'supabase_auth_admin は EXECUTE できる (Auth サブシステムから hook 呼び出し)'
);

-- ----------------------------------------
-- Test 10: auth_allowed_email_domains に RLS が enable されている (Codex iter-1 P2 追加)
-- ----------------------------------------
-- 退行検出: alter table ... enable row level security を消すと fail。
-- 単体では実害が無いが、revoke を緩めたときの最終防衛線として固定する。
select is(
  (select relrowsecurity from pg_class
    where oid = 'public.auth_allowed_email_domains'::regclass),
  true,
  'auth_allowed_email_domains: RLS が enable されている (default-deny の前提)'
);

-- ----------------------------------------
-- Test 11-14: authenticated は 4 DML 全てに privilege が無い (Codex iter-1 P2 追加)
-- ----------------------------------------
-- 退行検出: revoke all on auth_allowed_email_domains from authenticated を消すと
-- Supabase default privileges 経由で SELECT / INSERT 等が grant されて fail する。
-- 列挙攻撃 (許可ドメイン一覧の網羅) の入口を遮断する設計を固定。
select is(
  has_table_privilege('authenticated', 'public.auth_allowed_email_domains', 'SELECT'),
  false,
  'authenticated: SELECT privilege なし (列挙攻撃の入口を遮断)'
);

select is(
  has_table_privilege('authenticated', 'public.auth_allowed_email_domains', 'INSERT'),
  false,
  'authenticated: INSERT privilege なし'
);

select is(
  has_table_privilege('authenticated', 'public.auth_allowed_email_domains', 'UPDATE'),
  false,
  'authenticated: UPDATE privilege なし'
);

select is(
  has_table_privilege('authenticated', 'public.auth_allowed_email_domains', 'DELETE'),
  false,
  'authenticated: DELETE privilege なし'
);

-- ----------------------------------------
-- Test 15-18: anon も同じく 4 DML 全てに privilege が無い (Codex iter-1 P2 追加)
-- ----------------------------------------
-- 退行検出: revoke all from anon を消すと fail。サインイン前のユーザ
-- (anon ロール) も allowlist を読めないことを固定する。
select is(
  has_table_privilege('anon', 'public.auth_allowed_email_domains', 'SELECT'),
  false,
  'anon: SELECT privilege なし'
);

select is(
  has_table_privilege('anon', 'public.auth_allowed_email_domains', 'INSERT'),
  false,
  'anon: INSERT privilege なし'
);

select is(
  has_table_privilege('anon', 'public.auth_allowed_email_domains', 'UPDATE'),
  false,
  'anon: UPDATE privilege なし'
);

select is(
  has_table_privilege('anon', 'public.auth_allowed_email_domains', 'DELETE'),
  false,
  'anon: DELETE privilege なし'
);

-- ----------------------------------------
-- Test 19: runtime sanity — authenticated として SELECT すると 42501 (Codex iter-1 P2 追加)
-- ----------------------------------------
-- has_table_privilege が静的に false を返すことに加えて、実行時の挙動も固定する。
-- PostgreSQL は privilege check を RLS より先に評価するため SELECT は 42501 で
-- 弾かれ、「default-deny で 0 行返却」の挙動には到達しない (revoke と RLS の
-- 多層防御のうち revoke 層が実効)。
select tests.create_supabase_user('rls-tester@example.com');
select tests.authenticate_as('rls-tester@example.com');

select throws_ok(
  $$ select count(*) from public.auth_allowed_email_domains $$,
  '42501',
  null,
  'authenticated runtime: SELECT は 42501 で阻止される (privilege check が RLS より先に評価)'
);

-- ----------------------------------------
-- Test 20: P1 fix — non-Google identity の hd claim は無視される (Codex iter-1 P1 追加)
-- ----------------------------------------
-- 設計意図は「Google Workspace の hd claim のみを email より優先」。
-- provider !== 'google' の identity に hd claim があっても、allowlist 迂回経路に
-- ならないことを固定。退行検出: 関数の `identity->>'provider' = 'google'` ガード
-- を消すと、非 Google provider の hd 値で domain が上書きされて fail する。
-- (allowlist に 'example.com' が入っている前提 — Test 2 で insert 済み、Test 4
-- でさらに 'asahi-tanker.co.jp' / 'partner-fleet.example' が追加されている)
select tests.clear_authentication();  -- postgres ロールに戻して関数を直接呼べるように

select is(
  public.before_user_created_restrict_email_domain(
    jsonb_build_object(
      'user', jsonb_build_object(
        'email', 'user@other.com',
        'identities', jsonb_build_array(
          jsonb_build_object(
            'provider', 'custom-oidc',
            'identity_data', jsonb_build_object(
              'email', 'user@other.com',
              'hd', 'example.com'
            )
          )
        )
      )
    )
  ),
  pg_temp.expected_rejection(),
  'P1 hardening: non-Google provider の hd claim は無視され email ドメインで判定される (allowlist 迂回防止)'
);

-- ----------------------------------------
-- Test 21: deny-all RLS policy が存在する (20260520070025_*.sql)
-- ----------------------------------------
-- Supabase Advisor lint 0011 (rls_enabled_no_policy) silence + 設計意図
-- 「authenticated / anon は完全遮断」の明示化のために置いた policy。
-- 実 runtime では table-level の revoke all が先に privilege check で 42501
-- を返すため評価到達しないが、policy が消されると Advisor 警告が復活する
-- + 意図文書化が失われるため、存在を pgTAP で固定する。
select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_allowed_email_domains'
      and policyname = 'deny_all_to_authenticated_and_anon'),
  1,
  'deny_all_to_authenticated_and_anon policy が存在する (Advisor lint 0011 silence + 設計意図明示)'
);

select * from finish();
rollback;
