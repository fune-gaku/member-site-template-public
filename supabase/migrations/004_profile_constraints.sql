-- ========================================
-- Phase 2: profiles テーブルの入力制約強化 (Issue #007)
-- ========================================
--
-- アプリ層（Astro Action `profile.update` + Zod: trim + max(100)）で検証しているが、
-- 多層防御として DB 側にも CHECK 制約を置き、service_role 経由や将来の別アプリから
-- 直接書き込まれた場合でも不正値を拒否する。
--
-- 適用順序: 既に 100 文字超のレコードが存在するとそのままでは CHECK 追加に失敗するため、
-- まず UPDATE で切り詰め → その後 ALTER TABLE で CHECK 制約を付与する。
-- 本番反映は Supabase SQL Editor で本ファイル全体を一括実行する（トランザクション内で
-- 整合する）。詳細は `CLAUDE.md` のマイグレーション運用を参照。

-- 既存データの健全性チェック（100 文字超のレコードがあれば事前に切り詰める）
update public.profiles
  set display_name = left(display_name, 100)
  where display_name is not null and char_length(display_name) > 100;

-- display_name の長さ制約（NULL は許可。空文字は「表示名未設定」として許可）
alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 100);

comment on constraint profiles_display_name_length on public.profiles is
  'Issue #007: 多層防御として display_name を 100 文字以下に制限。アプリ層の Zod 検証と合わせて運用。';
