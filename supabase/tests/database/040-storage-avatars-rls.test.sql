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
select plan(5);

-- 注: DELETE の RLS は本ファイルではテストしない。Supabase は
-- storage.objects に protect_delete() トリガーを設定しており、
-- ロールに関わらず **すべての** 直接 DELETE をブロックする
-- (Storage API 経由でしか削除できない設計)。よって RLS の DELETE
-- ポリシー (`Users can delete own avatars`) は protect_delete の手前で
-- 評価される機会が無く、pg レベルの直接 DELETE で RLS だけを単独検証
-- することは構造的に不可能。RLS 自体は init.sql に書かれているが、
-- 真の防衛線は protect_delete + Storage API のサーバ側認可になる。

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

select * from finish();
rollback;
