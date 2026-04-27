-- ========================================
-- Fix: profiles.role への権限昇格脆弱性を閉じる
-- ========================================
--
-- 問題:
--   20260420205000_init.sql は権限昇格防止として以下を入れていた:
--     revoke update (role) on public.profiles from authenticated;
--   しかし Supabase の default privileges
--   (`alter default privileges in schema public grant all on tables to
--    anon, authenticated, service_role`) により、
--   public.profiles は table-level UPDATE が authenticated に grant されている。
--   PostgreSQL の挙動上、table-level UPDATE は全カラムに継承されるため、
--   column-level revoke 単独では実効しない (no-op になる)。
--
-- 結果として、現状の本番では authenticated ユーザーが直接 PostgREST 経由で
--   update profiles set role = 'admin' where user_id = auth.uid()
-- を成功させられる (RLS は own row への UPDATE を許可しているため、
-- 残る防壁は column-level revoke だけだったが効いていない)。
--
-- 修正:
--   1. table-level UPDATE を authenticated から剥奪する
--   2. 安全なカラム (display_name / avatar_url / updated_at) のみ
--      column-level UPDATE を再付与する
--
-- これにより `update profiles set role = ...` は権限不足で 42501 となり、
-- 通常のプロフィール更新フロー (display_name 等) は引き続き動作する。
-- service_role の grant (init.sql で付与済み) は無関係なので影響なし。
--
-- 関連: pgTAP テスト (Issue #35) でこの不変条件を回帰検出する。

revoke update on public.profiles from authenticated;

grant update (display_name, avatar_url, updated_at)
  on public.profiles to authenticated;

comment on table public.profiles is
  '一般ユーザーは display_name / avatar_url / updated_at のみ UPDATE 可能。'
  ' role 列はカラム権限剥奪により書き換え不可 (admin.updateUserRole が service_role 経由で行う)。';
