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

-- 既存のオブジェクトで上記ポリシーに違反しているものを棚卸しする。
-- 削除は行わない（データ損失を防ぐため）。運用側で確認 → 手動削除する前提。
-- 運用開始直後なら 0 件のはず。
do $$
declare
  oversized_count int;
  disallowed_mime_count int;
begin
  select count(*) into oversized_count
    from storage.objects
   where bucket_id = 'avatars'
     and (
       metadata->>'size' is null
       or (metadata->>'size')::bigint > 5 * 1024 * 1024
     );

  select count(*) into disallowed_mime_count
    from storage.objects
   where bucket_id = 'avatars'
     and coalesce(metadata->>'mimetype', '') not in (
       'image/png', 'image/jpeg', 'image/webp', 'image/gif'
     );

  if oversized_count > 0 then
    raise warning 'avatars bucket has % object(s) over 5MB; please review manually (see Issue #008)', oversized_count;
  end if;

  if disallowed_mime_count > 0 then
    raise warning 'avatars bucket has % object(s) with disallowed MIME; please review manually (see Issue #008)', disallowed_mime_count;
  end if;
end $$;
