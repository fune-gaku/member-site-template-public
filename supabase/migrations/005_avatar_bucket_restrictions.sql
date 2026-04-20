-- ========================================
-- Phase 2: avatars バケットの MIME / サイズ制限 (Issue #008)
-- ========================================
--
-- Supabase Storage は バケットレベルで allowed_mime_types と file_size_limit を
-- 定義できる (storage.buckets テーブル)。NULL のままだと無制限なので、
-- SVG を含むベクター / 実行可能形式を拒否し、5MB 上限を掛ける。
--
-- 公式ドキュメント: https://supabase.com/docs/guides/storage/buckets/fundamentals
-- > "Upload restrictions like max file size and allowed content types are
-- >  defined at the bucket level."
--
-- NOTE: 本テンプレートでは image/svg+xml を **意図的に除外** している。
-- SVG は XML + JS 実行コンテナ (onload / <script> を埋め込める) で、
-- 同一ホスト (<ref>.supabase.co) 上で Stored XSS になり得るため画像として扱わない。
-- 併せて src/actions/index.ts の storage.uploadAvatar でも Zod で早期検証し、
-- upload() 時に contentType を明示指定する (クライアントの Content-Type を盲信しない)。

update storage.buckets
   set allowed_mime_types = array[
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif'
       ],
       file_size_limit = 5 * 1024 * 1024  -- 5 MB (bytes)
 where id = 'avatars';

-- ========================================
-- 既存オブジェクトの棚卸し（migration とは別に、運用側で手動実行）
-- ========================================
-- 既存のオブジェクトで上記ポリシーに違反しているものがあるか、運用開始後に
-- 以下のクエリを Supabase SQL Editor で実行して確認する。
-- 削除は行わない（データ損失を防ぐため）。運用側で確認 → 手動削除する前提。
-- 運用開始直後なら 0 件のはず。
--
-- NOTE: 元は DO $$ ... $$ 匿名ブロックで RAISE WARNING していたが、
-- Supabase Database Linter が DECLARE 節のローカル変数 (int) を CREATE TABLE と
-- 誤認識して RLS 警告を出すため、棚卸しを SELECT 文に分離した。
-- 公式ドキュメント: https://www.postgresql.org/docs/current/plpgsql-declarations.html
-- (DO ブロック内の DECLARE 変数は実行中メモリのローカル変数であり永続テーブルではない)

-- 棚卸しクエリ 1: ファイルサイズ違反 (5MB 超)
-- select count(*) as oversized_count
--   from storage.objects
--  where bucket_id = 'avatars'
--    and (
--      metadata->>'size' is null
--      or (metadata->>'size')::bigint > 5 * 1024 * 1024
--    );

-- 棚卸しクエリ 2: MIME タイプ違反
-- select count(*) as disallowed_mime_count
--   from storage.objects
--  where bucket_id = 'avatars'
--    and coalesce(metadata->>'mimetype', '') not in (
--      'image/png', 'image/jpeg', 'image/webp', 'image/gif'
--    );

-- 棚卸しクエリ 3: 違反オブジェクトの詳細 (削除判断用)
-- select id, name, owner,
--        metadata->>'mimetype' as mime,
--        metadata->>'size' as size_bytes,
--        created_at
--   from storage.objects
--  where bucket_id = 'avatars'
--    and (
--      (metadata->>'size')::bigint > 5 * 1024 * 1024
--      or coalesce(metadata->>'mimetype', '') not in (
--        'image/png', 'image/jpeg', 'image/webp', 'image/gif'
--      )
--    );
