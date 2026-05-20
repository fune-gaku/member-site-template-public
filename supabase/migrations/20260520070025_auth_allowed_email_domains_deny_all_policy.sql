-- ========================================
-- public.auth_allowed_email_domains に deny-all RLS policy を追加
-- ========================================
--
-- 目的: Supabase Advisor lint 0011 (rls_enabled_no_policy) を silence しつつ
-- 設計意図「authenticated / anon からは一切アクセス不可」を policy として
-- 明示化する。
--
-- 前提となる多層防御 (20260520001905_add_email_domain_allowlist.sql):
--   1. `revoke all on public.auth_allowed_email_domains from public, anon,
--      authenticated;` で privilege を完全剥奪
--   2. `enable row level security` を宣言 (policy 無しなので default-deny)
--
-- PostgreSQL は privilege check を RLS より先に評価する。したがって
-- authenticated / anon から SELECT 等を試みた場合、privilege が無いため
-- 42501 (permission denied) で即座に弾かれ、本 policy は **runtime 上
-- 評価されない** (pgTAP `090-...test.sql` Test 19 で固定済)。
--
-- それでもこの policy を追加する理由:
--   - Supabase Advisor lint 0011 は「RLS 有効だが policy 無し」を generic に
--     警告する (本来は policy 書き忘れで意図せず全 access を遮断する事故を
--     拾う目的)。我々の場合は意図的 default-deny なので false positive だが、
--     fork 利用者が同じ警告に遭遇すると毎回説明コストが発生する
--   - policy として明示することで「authenticated / anon は一切触れない」
--     設計意図がコード上に残る (将来の編集者 / レビュアーに伝わる)
--
-- policy の意味論:
--   - `for all` : SELECT / INSERT / UPDATE / DELETE 全てに適用
--   - `to authenticated, anon` : 対象 role を明示
--   - `using (false)` : SELECT / UPDATE / DELETE 時に「どの row も該当しない」
--     と判定 → 0 行返却 / 影響行 0
--   - `with check (false)` : INSERT / UPDATE 時に「書き込み条件を満たさない」
--     と判定 → 必ず拒否
--
-- 注: `to authenticated, anon` を明示することで postgres / service_role
-- (Hook 関数 SECURITY DEFINER 経由のアクセス + Studio SQL Editor からの
-- 直接操作) は policy 対象外となり、従来通り読み書きできる。

create policy "deny_all_to_authenticated_and_anon"
  on public.auth_allowed_email_domains
  for all
  to authenticated, anon
  using (false)
  with check (false);

comment on policy "deny_all_to_authenticated_and_anon"
  on public.auth_allowed_email_domains is
  'authenticated / anon を完全に遮断する deny-all policy。実 runtime では table-level の revoke all が先に効くため評価到達しないが、Supabase Advisor lint 0011 silence + 設計意図の明示化のために置く。';
