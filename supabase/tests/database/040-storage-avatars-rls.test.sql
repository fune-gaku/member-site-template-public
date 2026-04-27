-- ========================================
-- Storage avatars バケット RLS のテスト
-- ========================================
-- 検証対象 (20260420205000_init.sql):
--   - storage.buckets に id='avatars' (private + 5MB + MIME 4 種限定) が存在
--   - storage.objects に対する 4 つの RLS ポリシー:
--       "Users can view own avatars"   (select)
--       "Users can upload own avatars" (insert with check)
--       "Users can update own avatars" (update)
--       "Users can delete own avatars" (delete)
--   - フォルダ判定: (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
--
-- 退行検出: フォルダ判定の where 句を緩めると該当テストが fail。

begin;
select plan(10);

-- 注: DELETE の RLS は本ファイルではテストしない。Supabase は
-- storage.objects に protect_delete() トリガーを設定しており、
-- ロールに関わらず **すべての** 直接 DELETE をブロックする
-- (Storage API 経由でしか削除できない設計)。よって RLS の DELETE
-- ポリシー (`Users can delete own avatars`) は protect_delete の手前で
-- 評価される機会が無く、pg レベルの直接 DELETE で RLS だけを単独検証
-- することは構造的に不可能。RLS 自体は init.sql に書かれているが、
-- 真の防衛線は protect_delete + Storage API のサーバ側認可になる。
--
-- 設計ノート (Codex iteration 1 P1 finding 2):
--   negative-only な assertion (例: bob から alice のファイルは見えない)
--   は対応 policy 自体を消しても 0 rows で green のままになる。
--   alice 視点での positive 検証 (SELECT/UPDATE) と、bucket メタデータ
--   (public, allowed_mime_types) の検証を加えて、policy / bucket 設定
--   の regression を実効的に捕捉する。

-- セットアップ: alice, bob 作成
select tests.create_supabase_user('alice@example.com');
select tests.create_supabase_user('bob@example.com');

-- バケット存在の sanity check (init.sql で作られているはず)
select is(
  (select id from storage.buckets where id = 'avatars'),
  'avatars'::text,
  'avatars バケットが存在する'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  (5 * 1024 * 1024)::bigint,
  'avatars バケットの file_size_limit が 5MB'
);

-- バケットが private (public = false) であること
select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'avatars バケットは private (public = false)'
);

-- allowed_mime_types がちょうど 4 種で SVG を含まない
-- (image/svg+xml は意図的に除外: XML + JS 実行コンテナで Stored XSS リスク)
select results_eq(
  $$ select unnest(allowed_mime_types)::text from storage.buckets where id = 'avatars' order by 1 $$,
  $$ values ('image/gif'::text), ('image/jpeg'::text), ('image/png'::text), ('image/webp'::text) $$,
  'allowed_mime_types は image/png/jpeg/webp/gif の 4 種のみ (image/svg+xml は意図的に除外)'
);

-- alice の avatar を postgres 権限で直接 insert (RLS バイパス)
insert into storage.objects (bucket_id, name, owner)
values (
  'avatars',
  tests.get_supabase_uid('alice@example.com')::text || '/avatar.png',
  tests.get_supabase_uid('alice@example.com')
);

-- ----------------------------------------
-- Test 3: alice は自分のフォルダにアップロードできる
-- ----------------------------------------
select tests.authenticate_as('alice@example.com');

select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner)
       values ('avatars', %L, (select auth.uid())) $$,
    tests.get_supabase_uid('alice@example.com')::text || '/another.png'
  ),
  'authenticated は自分の user_id フォルダ配下に upload できる'
);

-- ----------------------------------------
-- Test 4: alice は他ユーザー (bob) のフォルダに upload できない
-- ----------------------------------------
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner)
       values ('avatars', %L, (select auth.uid())) $$,
    tests.get_supabase_uid('bob@example.com')::text || '/evil.png'
  ),
  '42501',
  null,
  'authenticated が他ユーザーのフォルダに upload しようとすると RLS with check で 42501'
);

-- ----------------------------------------
-- Test 5: bob は alice のフォルダ内のファイルを SELECT できない
-- ----------------------------------------
select tests.authenticate_as('bob@example.com');

select results_eq(
  format(
    $$ select count(*)::int from storage.objects
       where bucket_id = 'avatars'
         and (storage.foldername(name))[1] = %L $$,
    tests.get_supabase_uid('alice@example.com')::text
  ),
  $$ values (0) $$,
  'bob は alice の avatars フォルダ内ファイルを SELECT できない'
);

-- ----------------------------------------
-- Test 8 (positive): alice は自分のフォルダのファイルを SELECT できる
-- ----------------------------------------
-- SELECT policy が消されると alice の自己参照も 0 rows になり、
-- Test 7 の negative assertion はそれでも green のまま通ってしまう。
select tests.authenticate_as('alice@example.com');

select cmp_ok(
  (select count(*)::int from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = (select auth.uid())::text),
  '>=',
  2,
  'alice は自分のフォルダのファイルを SELECT できる (>=2 件: 直接 insert + Test 5 で upload)'
);

-- ----------------------------------------
-- Test 9 (positive): alice は自分のファイルを UPDATE できる (UPDATE policy)
-- ----------------------------------------
-- 検証対象: "Users can update own avatars" policy。owner 列を更新しても
-- 自分のフォルダ内ファイルなら通るはず (UPDATE policy の using 節)。
with upd as (
  update storage.objects set updated_at = now()
   where bucket_id = 'avatars'
     and (storage.foldername(name))[1] = (select auth.uid())::text
  returning 1
)
select cmp_ok(
  (select count(*)::int from upd),
  '>=',
  1,
  'alice は自分のフォルダ内ファイルを UPDATE できる (>=1 row affected)'
);

-- ----------------------------------------
-- Test 10 (negative): alice は bob のフォルダのファイルを UPDATE できない
-- ----------------------------------------
-- 直接 insert で bob のファイルを 1 件用意 (postgres セッションに戻して)
select tests.clear_authentication();
insert into storage.objects (bucket_id, name, owner)
values (
  'avatars',
  tests.get_supabase_uid('bob@example.com')::text || '/bob-file.png',
  tests.get_supabase_uid('bob@example.com')
);

select tests.authenticate_as('alice@example.com');

with upd as (
  update storage.objects set updated_at = now()
   where bucket_id = 'avatars'
     and (storage.foldername(name))[1] = tests.get_supabase_uid('bob@example.com')::text
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'alice は bob のフォルダ内ファイルを UPDATE できない (0 rows; using 節で弾かれる)'
);

select * from finish();
rollback;
