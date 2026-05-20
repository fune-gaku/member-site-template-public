-- ========================================
-- Issue #11: メールドメイン allowlist を Before User Created Hook で実装
-- ========================================
--
-- 目的:
--   特定のメールドメインの利用者のみ signup を許可する仕組みを opt-in で提供。
--   旭タンカー等「招待制クローズド会員サイト」「特定 Google Workspace 限定」
--   用途で、招待 URL を共有した瞬間に第三者が紛れ込むのを防ぐ。
--
-- 設計方針:
--   - **provider-agnostic**: email/password / Google OAuth / 将来の他 provider
--     すべてに同じ allowlist が効く (Before User Created Hook は全 provider
--     共通で発火する)
--   - **opt-in**: allowlist テーブルが空 (= 既定) なら従来通り無制限に許可。
--     テンプレ利用者が INSERT して初めて制限が効く (backward-compat)
--   - **Google Workspace 対応**: ID token の `hd` claim を email 文字列より
--     優先 (Google 公式の暗号学的に正しいドメイン確認方法)
--   - **管理は SQL 直接編集**: 当面 admin UI は持たない。
--     `insert into public.auth_allowed_email_domains (domain) values (...);` を
--     Supabase Dashboard SQL Editor / supabase migration new から実行する
--
-- 採用しなかった選択肢:
--   - email_verified の厳格チェック: email/password signup は hook 発火時点で
--     未確認 (false) なので、強制すると email/password 経路が常に reject される。
--     Supabase 公式サンプル (hook_restrict_signup_by_email_domain) も email_verified
--     を見ていないため不採用
--   - deny list: 公式サンプルは allow/deny の enum 併存だが、本テンプレの想定
--     ユースケース (招待制 / 特定企業限定) では allow のみで十分
--
-- 公式: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

-- ----------------------------------------
-- 1. 許可ドメインテーブル
-- ----------------------------------------
-- domain は lowercase 強制 + DNS 風形式 (label + TLD 2 文字以上) を CHECK で
-- 担保する。format バリデーションを Hook 関数側で重複させない最小限のガード。
create table public.auth_allowed_email_domains (
  domain     text primary key
             check (domain = lower(domain)
                and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.auth_allowed_email_domains is
  'Issue #11: signup を許可するメールドメインの allowlist。空の場合は制限なし (テンプレ既定)。INSERT/DELETE は service_role / postgres 経由のみ (Supabase Dashboard SQL Editor / supabase migration new)。読み出しは Before User Created Hook (security definer 関数) からのみ。';

comment on column public.auth_allowed_email_domains.domain is
  'lowercase 強制 + DNS label.tld 形式の CHECK 制約付き。例: "example.com", "asahi-tanker.co.jp"';

comment on column public.auth_allowed_email_domains.note is
  '運用メモ (誰が・なぜ追加したか)。表示には使わない。';

-- ----------------------------------------
-- 2. RLS: 誰も authenticated として読み書きできない
-- ----------------------------------------
-- policy を一切作らず default-deny に置き、さらに table-level の権限剥奪で
-- 二重に固定する (20260427002055_fix_profiles_role_privilege_escalation.sql /
-- 20260506160000_user_roles_table.sql と同じ多層防御パターン)。
--
-- 列挙攻撃の入口を絞る: authenticated に SELECT を許すと「自社の許可ドメイン
-- を網羅する」リコネ手段になりうるため authenticated にも見せない。
--
-- service_role / postgres は Supabase の default privileges で full access が
-- 維持される (RLS bypass)。Hook 関数 (SECURITY DEFINER, owner=postgres) も
-- postgres 権限で読み出せる。
alter table public.auth_allowed_email_domains enable row level security;

revoke all on public.auth_allowed_email_domains from public, anon, authenticated;

-- ----------------------------------------
-- 3. Before User Created Hook 関数
-- ----------------------------------------
-- Supabase Auth が user 作成前に jsonb event を渡して呼び出す。
-- 戻り値:
--   - 許可: '{}'::jsonb
--   - 拒否: {"error": {"message": "...", "http_code": 403}}
--
-- security context:
--   - SECURITY DEFINER + owner=postgres で、auth_allowed_email_domains の RLS を
--     bypass して読める (table-level revoke も postgres は default 権限を保持)
--   - search_path = '' + public.* 完全修飾で search_path ハイジャック対策
--     (Issue #41 / handle_new_user と同じフェイルセーフ)
--
-- ロジック:
--   0. allowlist 空 → 無制限許可 (opt-in 既定)
--   1. event->'user'->>'email' からドメイン抽出
--   2. identities[].identity_data.hd があれば優先 (Google Workspace の正しい
--      ドメイン確認手段)
--   3. lowercase で allowlist 照合
create or replace function public.before_user_created_restrict_email_domain(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email      text;
  user_domain     text;
  identity        jsonb;
  identity_data   jsonb;
  hd_value        text;
  allowlist_count int;
  match_count     int;
  rejection       constant jsonb := jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'このドメインのアカウントではサインインできません',
      'http_code', 403
    )
  );
begin
  -- 0. allowlist 空 → 既定で許可 (backward-compat)
  select count(*) into allowlist_count from public.auth_allowed_email_domains;
  if allowlist_count = 0 then
    return '{}'::jsonb;
  end if;

  -- 1. user email を取得 (event 構造異常時は安全側に倒して reject)
  user_email := event->'user'->>'email';
  if user_email is null or position('@' in user_email) = 0 then
    return rejection;
  end if;
  user_domain := lower(split_part(user_email, '@', 2));

  -- 2. Google Workspace の hd claim があれば優先
  --    OAuth 経由の signup では event->'user'->'identities' に identity 配列が入る。
  --    `hd` は Google 専用 OIDC claim だが、本ループでは provider が 'google' の
  --    identity に限定して参照する (Codex review P1 / defense in depth):
  --      - 設計意図は「Google Workspace の正しいドメイン確認」であり、provider に
  --        関わらず `identity_data.hd` を信頼すると、将来追加される他 OAuth
  --        provider (カスタム OIDC 等) が `hd` 風 claim を流したときに allowlist を
  --        迂回される脅威面ができる。
  --      - Supabase identity の `provider` フィールドは `'google'` lowercase 固定
  --        ([Supabase JS Auth docs](https://supabase.com/docs/reference/javascript/auth-getuseridentities))。
  for identity in
    select * from jsonb_array_elements(coalesce(event->'user'->'identities', '[]'::jsonb))
  loop
    identity_data := identity->'identity_data';
    if identity_data is null then continue; end if;
    if identity->>'provider' = 'google' and identity_data ? 'hd' then
      hd_value := lower(identity_data->>'hd');
      if hd_value is not null and hd_value <> '' then
        user_domain := hd_value;
        exit;
      end if;
    end if;
  end loop;

  -- 3. allowlist 照合 (domain は CHECK 制約で lowercase 強制済み)
  select count(*) into match_count
    from public.auth_allowed_email_domains
   where domain = user_domain;

  if match_count = 0 then
    return rejection;
  end if;

  return '{}'::jsonb;
end;
$$;

comment on function public.before_user_created_restrict_email_domain(jsonb) is
  'Issue #11: Supabase Before User Created Hook 用。auth_allowed_email_domains が空なら無制限許可、非空なら email のドメインを照合し不一致なら 403 reject。Google Workspace の hd claim を優先参照。';

-- ----------------------------------------
-- 4. 権限: supabase_auth_admin のみ EXECUTE 可
-- ----------------------------------------
-- Supabase 公式の要求: Auth サブシステムは supabase_auth_admin ロールで
-- hook 関数を呼び出すため、EXECUTE 権限が必須。
grant execute
  on function public.before_user_created_restrict_email_domain(jsonb)
  to supabase_auth_admin;

-- REST 公開遮断 (20260428112930_revoke_handle_new_user_execute.sql と同型):
-- public schema 配下の関数は PostgREST 経由で /rest/v1/rpc/... として
-- exposed されるため、anon / authenticated / public から EXECUTE を剥奪する。
-- has_function_privilege は PUBLIC 経由でも true を返す仕様のため
-- PUBLIC からの剥奪が anon/authenticated への有効な剥奪条件になる。
revoke execute
  on function public.before_user_created_restrict_email_domain(jsonb)
  from public, anon, authenticated;
