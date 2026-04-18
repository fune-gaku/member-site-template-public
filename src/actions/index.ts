import { z } from "astro/zod";
import { defineAction, ActionError } from "astro:actions";

import { createClient } from "../lib/supabase";
import { createAdminClient } from "../lib/supabase-admin";

export const server = {
  auth: {
    signUp: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }),
      handler: async (input, context) => {
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
        const sanitizedFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
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

  admin: {
    createUser: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email(),
        password: z.string().min(6),
        displayName: z.string().optional(),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const {
          data: { user: caller },
        } = await supabase.auth.getUser();
        if (!caller) throw new ActionError({ code: "UNAUTHORIZED" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", caller.id)
          .single();
        if (profile?.role !== "admin") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Admin only",
          });
        }

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
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const {
          data: { user: caller },
        } = await supabase.auth.getUser();
        if (!caller) throw new ActionError({ code: "UNAUTHORIZED" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", caller.id)
          .single();
        if (profile?.role !== "admin") {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "Admin only",
          });
        }

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
  },
};
