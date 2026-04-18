-- ========================================
-- Phase 3: service_role に対する明示的な権限付与
-- ========================================
--
-- 001_init.sql で `revoke update (role) on public.profiles from authenticated`
-- を実施している。PostgreSQL の挙動上、テーブル所有者（service_role が該当）は
-- REVOKE の影響を受けないため実運用では service_role から role 列を更新できるが、
-- Supabase 公式ドキュメントでは column privilege bypass が明文化されていない。
--
-- 明示的に `service_role` に対して profiles テーブル全列の UPDATE 権限を付与し、
-- 将来 PostgreSQL / Supabase の挙動が変わっても admin.updateUserRole が
-- 確実に動作することを保証する（多層防御）。

grant update on public.profiles to service_role;
