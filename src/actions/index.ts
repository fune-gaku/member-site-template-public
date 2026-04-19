import { z } from "astro/zod";
import { defineAction, ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { env } from "cloudflare:workers";

import { passwordSchema } from "../lib/password-schema";
import { isHibpCheckEnabled, isPasswordPwned } from "../lib/pwned-password";
import { createClient } from "../lib/supabase";
import { createAdminClient } from "../lib/supabase-admin";

/**
 * 環境変数 `ENABLE_HIBP_CHECK=true` のときのみ HIBP 漏洩チェックを実行する。
 * デフォルト（未設定）は無効。Supabase Pro プランで Leaked Password Protection を
 * 有効化している場合は本チェックは不要。詳細は `.claude/deployment.md` 参照。
 *
 * API 障害時はフェイルオープン（`isPasswordPwned` が false を返す）。
 */
async function assertNotPwned(password: string): Promise<void> {
  // `cloudflare:workers` の env は Cloudflare Workers 実行時のみ解決される。
  // ローカル vitest の Node 環境や型チェック時にアクセスしても例外にならないよう
  // 属性アクセスは try で包む。
  let flag: string | undefined;
  try {
    flag = (env as unknown as Record<string, string | undefined>)
      .ENABLE_HIBP_CHECK;
  } catch {
    flag = undefined;
  }
  if (!isHibpCheckEnabled(flag)) return;

  if (await isPasswordPwned(password)) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        "このパスワードは過去の漏洩データに含まれています。別のパスワードを使用してください。",
    });
  }
}

/**
 * 認証済みユーザー + profile.role === "admin" を検証するヘルパー。
 * 成功時は caller の User を返す。失敗時は ActionError を throw。
 */
async function requireAdmin(context: ActionAPIContext) {
  const supabase = createClient({
    request: context.request,
    cookies: context.cookies,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "認証が必要です" });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (error) {
    console.error("requireAdmin: profile load error", error);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "権限情報の取得に失敗しました",
    });
  }
  if (profile?.role !== "admin") {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "管理者権限が必要です",
    });
  }
  return user;
}

export const server = {
  auth: {
    signUp: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: passwordSchema,
      }),
      handler: async (input, context) => {
        // 漏洩パスワードチェック（ENABLE_HIBP_CHECK=true の場合のみ）
        await assertNotPwned(input.password);

        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: `${context.url.origin}/auth/callback`,
          },
        });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),

    signIn: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string(),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (error) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),

    signOut: defineAction({
      handler: async (_, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        await supabase.auth.signOut();
        return { success: true };
      },
    }),

    resetPassword: defineAction({
      accept: "form",
      input: z.object({ email: z.string().email() }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo: `${context.url.origin}/auth/callback?type=recovery`,
          },
        );
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { success: true };
      },
    }),
  },

  storage: {
    uploadAvatar: defineAction({
      accept: "form",
      input: z.object({
        file: z.instanceof(File),
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
        const sanitizedFileName = input.file.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        const filePath = `${user.id}/${Date.now()}_${sanitizedFileName}`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(filePath, input.file, { upsert: true });

        if (error) {
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }

        // アップロード成功後、profiles テーブルの avatar_url を更新
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

    getSignedUrl: defineAction({
      input: z.object({ path: z.string() }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(input.path, 3600);
        if (error) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: error.message,
          });
        }
        return { url: data.signedUrl };
      },
    }),
  },

  // ----------------------------------------------------------------
  // member_posts CRUD
  // RLS で保護済みだが、Actions 側でも認証必須 + user_id はサーバー側で導出。
  // クライアントから user_id を受け取らない（サーバー側の auth.getUser() を信頼）。
  // ----------------------------------------------------------------
  posts: {
    create: defineAction({
      input: z.object({
        title: z.string().trim().min(1, "タイトルは必須です").max(200),
        body: z.string().max(10_000).optional().default(""),
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

        const { data, error } = await supabase
          .from("member_posts")
          .insert({
            user_id: user.id,
            title: input.title,
            body: input.body || null,
          })
          .select("id, title, body, created_at")
          .single();

        if (error) {
          console.error("posts.create error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "投稿の作成に失敗しました",
          });
        }
        return { post: data };
      },
    }),

    update: defineAction({
      input: z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1, "タイトルは必須です").max(200),
        body: z.string().max(10_000).optional().default(""),
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

        // RLS により他人の post は更新できないが、明示的に user_id で絞ることで
        // サーバー側でも追加のガードを行う（多層防御）。
        const { data, error } = await supabase
          .from("member_posts")
          .update({
            title: input.title,
            body: input.body || null,
          })
          .eq("id", input.id)
          .eq("user_id", user.id)
          .select("id, title, body, created_at")
          .single();

        if (error) {
          console.error("posts.update error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "投稿の更新に失敗しました",
          });
        }
        if (!data) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "対象の投稿が見つかりませんでした",
          });
        }
        return { post: data };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.string().uuid(),
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
          .from("member_posts")
          .delete()
          .eq("id", input.id)
          .eq("user_id", user.id);

        if (error) {
          console.error("posts.delete error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "投稿の削除に失敗しました",
          });
        }
        return { success: true };
      },
    }),
  },

  admin: {
    createUser: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: passwordSchema,
        displayName: z.string().optional(),
      }),
      handler: async (input, context) => {
        await requireAdmin(context);

        // 漏洩パスワードチェック（ENABLE_HIBP_CHECK=true の場合のみ）
        await assertNotPwned(input.password);

        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { display_name: input.displayName ?? "" },
        });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { userId: data.user.id };
      },
    }),

    inviteUser: defineAction({
      accept: "form",
      input: z.object({ email: z.string().email() }),
      handler: async (input, context) => {
        await requireAdmin(context);

        const supabaseAdmin = createAdminClient();
        const { data, error } =
          await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
            redirectTo: `${context.url.origin}/auth/callback`,
          });
        if (error) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        return { userId: data.user.id };
      },
    }),

    listUsers: defineAction({
      input: z.object({
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(1000).optional(),
      }),
      handler: async (input, context) => {
        await requireAdmin(context);

        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({
          page: input.page ?? 1,
          perPage: input.perPage ?? 100,
        });
        if (error) {
          console.error("admin.listUsers error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ユーザー一覧の取得に失敗しました",
          });
        }

        // profiles と突合して role / display_name を付与
        const ids = data.users.map((u) => u.id);
        let profilesById = new Map<
          string,
          { role: string; display_name: string | null }
        >();
        if (ids.length > 0) {
          const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("user_id, role, display_name")
            .in("user_id", ids);
          if (profilesError) {
            console.error("admin.listUsers profiles error", profilesError);
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: "プロフィール情報の取得に失敗しました",
            });
          }
          profilesById = new Map(
            (profiles ?? []).map((p) => [
              p.user_id,
              { role: p.role, display_name: p.display_name },
            ]),
          );
        }

        const users = data.users.map((u) => {
          const profile = profilesById.get(u.id);
          const role = profile?.role === "admin" ? "admin" : "member";
          return {
            id: u.id,
            email: u.email ?? "",
            displayName: profile?.display_name ?? "",
            role: role as "member" | "admin",
            createdAt: u.created_at,
          };
        });

        return { users };
      },
    }),

    updateUserRole: defineAction({
      input: z.object({
        userId: z.string().uuid(),
        role: z.enum(["member", "admin"]),
      }),
      handler: async (input, context) => {
        const caller = await requireAdmin(context);

        // 自分自身の role 変更は禁止（昇格・降格いずれも）
        if (caller.id === input.userId) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "自分自身のロールは変更できません",
          });
        }

        // role 列は一般ユーザーから revoke 済みのため service_role 経由で更新
        const supabaseAdmin = createAdminClient();
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ role: input.role })
          .eq("user_id", input.userId);

        if (error) {
          console.error("admin.updateUserRole error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ロールの更新に失敗しました",
          });
        }
        return { success: true };
      },
    }),
  },
};
