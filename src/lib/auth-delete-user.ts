import { ActionError } from "astro:actions";

/**
 * Issue #14: admin によるユーザーアカウント hard delete の本体実装。
 *
 * GDPR 第 17 条 / 個人情報保護法 第 35 条（消去請求）への defensive 対応として、
 * admin が他ユーザーを完全削除できる経路を提供する。self-service（ユーザー自身に
 * よる削除）は別 Issue で追加予定。
 *
 * 削除手順は **以下の順を厳守する** 必要がある:
 *
 *   1. Storage `avatars/<userId>/` 配下のオブジェクトを全件 remove
 *   2. `auth.users` から hard delete (`shouldSoftDelete: false`)
 *
 * Supabase 公式は **"You cannot delete a user if they are the owner of any
 * objects in Supabase Storage"** と明記しており、Storage を後回しにすると
 * `auth.admin.deleteUser` が owner constraint で失敗する。
 *
 * `auth.users` 削除は `public.profiles` / `public.member_posts` の `on delete
 * cascade` で連鎖削除される（pgTAP `070-cascade-delete-on-user-delete.test.sql`
 * で固定）。soft delete は "not reversible" で復活ツールを持たない本テンプレでは
 * 採用しない。
 *
 * @see https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
 * @see https://supabase.com/docs/guides/auth/managing-user-data
 */

interface DeleteUserInput {
  userId: string;
}

interface StorageFileEntry {
  name: string;
}

/**
 * `performDeleteUser` が必要とする最小 admin client インターフェース。
 *
 * テスト容易性のために `@supabase/supabase-js` の `SupabaseClient` 全体を
 * 受け取らず、本関数が触る storage / auth.admin の 3 メソッドだけを宣言する。
 * `auth-change-password.ts` の `ChangePasswordCapableClient` と同じ流儀。
 */
export interface DeleteUserCapableAdminClient {
  storage: {
    from(bucket: string): {
      list(folder: string): Promise<{
        data: StorageFileEntry[] | null;
        error: { message: string } | null;
      }>;
      remove(paths: string[]): Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
  auth: {
    admin: {
      deleteUser(
        userId: string,
        shouldSoftDelete: boolean,
      ): Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
  };
}

/** UI に表示する固定メッセージ（テストで参照するため export）。 */
export const DELETE_USER_INTERNAL_ERROR_MESSAGE =
  "ユーザーの削除に失敗しました";

export async function performDeleteUser(
  supabaseAdmin: DeleteUserCapableAdminClient,
  input: DeleteUserInput,
): Promise<{ success: true }> {
  const avatars = supabaseAdmin.storage.from("avatars");

  // 1. Storage avatars/<userId>/ を列挙（owner constraint 回避のため auth.users 削除前必須）
  const { data: files, error: listError } = await avatars.list(input.userId);
  if (listError) {
    console.error("admin.deleteUser storage.list failed:", listError);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });
  }

  // 2. 列挙された object を一括 remove
  if (files && files.length > 0) {
    const paths = files.map((f) => `${input.userId}/${f.name}`);
    const { error: removeError } = await avatars.remove(paths);
    if (removeError) {
      console.error("admin.deleteUser storage.remove failed:", removeError);
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
      });
    }
  }

  // 3. auth.users から hard delete（profiles / member_posts は cascade で連鎖削除）
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    input.userId,
    false,
  );
  if (deleteError) {
    console.error(
      "admin.deleteUser auth.admin.deleteUser failed:",
      deleteError,
    );
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: DELETE_USER_INTERNAL_ERROR_MESSAGE,
    });
  }

  return { success: true };
}
