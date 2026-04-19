# Issue #007: `display_name` がサーバ側検証なしでクライアントから直接更新される

**作成日**: 2026-04-20
**優先度**: Low
**ステータス**: Open
**カテゴリ**: Security (Input Validation)

---

## 問題の概要

プロフィール編集画面は **ブラウザの Supabase クライアントから直接 `profiles.update({ display_name })` を実行** しており、サーバ側（Astro Actions + Zod）での長さ・文字種バリデーションを一切経由しない。他の入力（`posts.title` / `posts.body`）は Action で `max(200)` / `max(10_000)` の Zod 検証を通るのに、`display_name` だけ検証抜け穴になっている。

### 該当箇所

**[src/components/ProfileForm.vue:104-107](../../src/components/ProfileForm.vue#L104-L107)**

```ts
const { error: updateError } = await supabase
  .from("profiles")
  .update({ display_name: displayName.value })
  .eq("user_id", user.id);
```

**[supabase/migrations/001_init.sql:8-15](../../supabase/migrations/001_init.sql#L8-L15)**

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,               -- ← 長さ制限なし
  ...
);
```

RLS により **他人の profile は書けない** ので権限昇格には直結しないが、以下の問題が残る。

---

## 影響

| リスク                 | 詳細                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| ストレージ圧迫         | `display_name` に 1MB の文字列を入れても受理される（PostgreSQL `text` 型の上限は 1GB）。悪意ある利用者が大量書き込みで DB を肥大化 |
| 管理画面の UI 破壊     | [AdminUserList.vue:195-197](../../src/components/AdminUserList.vue#L195-L197) は admin 画面で各ユーザーの `display_name` を表示。長大文字列で画面を壊せる |
| 二次 XSS の温床        | 現状 Vue の `{{ }}` は自動エスケープされるが、将来 `v-html` に変わった場合に即座に XSS 化。入力段階で無害化しておくのが堅い       |
| 他アクションとの一貫性 | `posts.*` は Action + Zod 経由なのに `display_name` だけ例外で、保守者の混乱を招く                                                 |

---

## 解決策

### 方針

1. **アプリ層**: `profiles.update` 相当を Astro Action `profile.update` に集約し、Zod で検証（単一入口化）
2. **DB 層**: `profiles.display_name` に `CHECK` 制約を追加（多層防御 / アプリを迂回されても守る）

この 2 段構えは既存の `member_posts` の設計（Action の Zod + RLS `with check`）と揃う。

### 実装タスク

#### 1. 新しい Action: `profile.update`

**[src/actions/index.ts](../../src/actions/index.ts)**

```ts
profile: {
  update: defineAction({
    input: z.object({
      displayName: z
        .string()
        .trim()
        .max(100, "表示名は100文字以下で入力してください"),
    }),
    handler: async (input, context) => {
      const supabase = createClient({
        request: context.request,
        cookies: context.cookies,
      });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new ActionError({
          code: "UNAUTHORIZED",
          message: "ログインしてください",
        });
      }

      const { error } = await supabase
        .from("profiles")
        .update({ display_name: input.displayName })
        .eq("user_id", user.id);
      if (error) {
        console.error("profile.update error", error);
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "プロフィールの更新に失敗しました",
        });
      }
      return { success: true };
    },
  }),
},
```

#### 2. `ProfileForm.vue` を Action 経由に変更

```vue
<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";
// createBrowserSupabase import を削除（直接 DB 書き込みはしない）

// ...

async function handleUpdateProfile() {
  isLoading.value = true;
  error.value = "";
  success.value = "";

  try {
    const { error: actionError } = await actions.profile.update({
      displayName: displayName.value,
    });
    if (actionError) {
      error.value = actionError.message;
    } else {
      success.value = "プロフィールを更新しました";
    }
  } catch (e) {
    console.error("Profile update error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>
```

アバターアップロード後の `profiles.avatar_url` 更新は既に [src/actions/index.ts:169-174](../../src/actions/index.ts#L169-L174) で Action 経由になっているので変更不要。

#### 3. DB CHECK 制約（多層防御）

**`supabase/migrations/004_profile_constraints.sql`**（新規）

```sql
-- ========================================
-- Phase 2: profiles テーブルの入力制約強化
-- ========================================
-- アプリ層（Astro Action + Zod）で検証しているが、多層防御として
-- DB 側にも CHECK 制約を置き、service_role 経由や将来の別アプリから
-- 直接書き込まれた場合でも不正値を拒否する。

alter table public.profiles
  add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 100);

-- 既存データの健全性チェック（100 文字超のレコードがあれば事前に切り詰める）
update public.profiles
  set display_name = left(display_name, 100)
  where display_name is not null and char_length(display_name) > 100;
```

**マイグレーション適用順序**: 本番反映前にまず既存行を 100 文字に揃える UPDATE を流し、その後 ALTER を流す。**Supabase SQL Editor で一括実行** で OK（上記 SQL はトランザクション内で整合する）。

#### 4. RLS ポリシーの見直し（選択）

現在の `Users can update own profile` ポリシーはそのまま残すが、`profile.update` Action で service_role は使っていないため **RLS は引き続き有効に効く**。変更不要。

もし将来「アプリ層で検証した値しか通さない」ことをより厳格にしたい場合、`authenticated` からは `update (display_name)` 権限を剥奪して service_role 経由にする選択肢もあるが、現状はオーバーエンジニアリング。**アプリ層検証＋DB CHECK の二層** で十分。

#### 5. テストケース

**`tests/profile-action.test.ts`**（新規、既存テスト環境に合わせて）

```ts
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";

const displayNameSchema = z.string().trim().max(100);

describe("profile.update input schema", () => {
  it("accepts empty string (clear display name)", () => {
    expect(displayNameSchema.safeParse("").success).toBe(true);
  });

  it("accepts 100-char string", () => {
    expect(displayNameSchema.safeParse("a".repeat(100)).success).toBe(true);
  });

  it("rejects 101-char string", () => {
    expect(displayNameSchema.safeParse("a".repeat(101)).success).toBe(false);
  });

  it("trims whitespace", () => {
    const r = displayNameSchema.safeParse("  hello  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("hello");
  });
});
```

---

## 受け入れ基準

- [ ] プロフィール編集 UI から 101 文字の `display_name` を送ると **400 系エラー** が返る
- [ ] RLS は引き続き効き、他人の profile は更新できない
- [ ] 既存データに 100 文字超の `display_name` があっても migration 後は解消されている
- [ ] `profiles_display_name_length` CHECK 制約が本番 DB に存在する（`psql` または Supabase SQL Editor で確認可能）
- [ ] admin 画面で異常に長い表示名による UI 崩れが起きない
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Astro: Actions](https://docs.astro.build/en/guides/actions/)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Using Zod with Supabase](https://supabase.com/docs/guides/auth/server-side) (SSR + Action パターン)
- [PostgreSQL: CHECK constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)
- [OWASP: Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)

---

## ラベル

`security`, `input-validation`, `defense-in-depth`, `low-priority`
