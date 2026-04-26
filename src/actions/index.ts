import { z } from "astro/zod";
import { defineAction, ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { env } from "cloudflare:workers";

import { getAuthUser } from "../lib/auth-claims";
import { performSignIn } from "../lib/auth-signin";
import {
  ALLOWED_AVATAR_MIME,
  MAX_AVATAR_SIZE,
  sanitizeAvatarFileName,
} from "../lib/avatar-upload";
import { passwordSchema } from "../lib/password-schema";
import { isHibpCheckEnabled, isPasswordPwned } from "../lib/pwned-password";
import { createClient } from "../lib/supabase";
import { createAdminClient } from "../lib/supabase-admin";
import {
  TURNSTILE_RESPONSE_FIELD,
  isTurnstileEnabled,
  verifyTurnstileToken,
} from "../lib/turnstile";

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
 * Turnstile (CAPTCHA) 検証。
 *
 * `PUBLIC_TURNSTILE_SITE_KEY` (公開) と `TURNSTILE_SECRET_KEY` (秘密) の
 * 両方が設定されているときだけ有効化する opt-in 方式。検証失敗は fail-closed
 * で BAD_REQUEST。トークンは Cloudflare Workers の `CF-Connecting-IP` で
 * 縛り、token の使い回しを抑制する。
 */
async function assertTurnstilePassed(
  token: string | undefined,
  request: Request,
): Promise<void> {
  let siteKey: string | undefined;
  let secret: string | undefined;
  try {
    const e = env as unknown as Record<string, string | undefined>;
    siteKey = e.PUBLIC_TURNSTILE_SITE_KEY;
    secret = e.TURNSTILE_SECRET_KEY;
  } catch {
    siteKey = undefined;
    secret = undefined;
  }
  if (!isTurnstileEnabled(siteKey, secret)) return;

  // 上の guard で secret は string 確定
  const remoteIp = request.headers.get("CF-Connecting-IP") ?? undefined;
  const ok = await verifyTurnstileToken(token, secret as string, remoteIp);
  if (!ok) {
    throw new ActionError({
      code: "BAD_REQUEST",
      message:
        "ボット対策の検証に失敗しました。ページを再読み込みしてもう一度お試しください。",
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
  const user = await getAuthUser(supabase);
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
        email: z.string().email().max(254),
        password: passwordSchema,
        // Turnstile widget が submit に含める hidden field。
        // Turnstile が無効化されている環境では未送信なので optional。
        // 有効化されている場合は assertTurnstilePassed が空文字列を弾く。
        [TURNSTILE_RESPONSE_FIELD]: z.string().max(2048).optional(),
      }),
      handler: async (input, context) => {
        // CAPTCHA (Turnstile) — 環境変数で opt-in。無効時は noop。
        await assertTurnstilePassed(
          input[TURNSTILE_RESPONSE_FIELD],
          context.request,
        );

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
        email: z.string().email().max(254),
        password: z.string().max(200),
      }),
      // 本体は `src/lib/auth-signin.ts` の `performSignIn` に分離してある。
      // Issue #8 (A3): すべての失敗ケースを統一メッセージに正規化することで
      // アカウント列挙を防ぐ。Timing は Supabase 側の bcrypt 検証が
      // 概ね吸収する想定。
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        return performSignIn(supabase, input);
      },
    }),

    signOut: defineAction({
      // `<form method="POST" action={actions.auth.signOut}>` からの FormData 送信を受け付ける。
      // GET による強制ログアウト（CSRF）を防ぐため、Action ルート経由のみを正とする。
      // `security.checkOrigin`（astro.config.mjs で既定値 true を維持）により
      // クロスオリジン POST は 403 で自動拒否される。
      accept: "form",
      handler: async (_, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        await supabase.auth.signOut();
        // 値を返すのみ。リダイレクトは呼び出し側（フォームを持つページ）で
        // `Astro.getActionResult()` を見て行う（Astro 作法）。
        return { success: true };
      },
    }),

    resetPassword: defineAction({
      accept: "form",
      input: z.object({ email: z.string().email().max(254) }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        // NOTE: 真の情報源は Supabase Dashboard の Email Templates 設定。
        // Dashboard のテンプレート (例: `{{ .SiteURL }}/auth/confirm?token_hash=...&type=recovery&next=/auth/update-password`)
        // がリンクを生成するため、本 redirectTo は Dashboard 側でテンプレートが未設定の場合の
        // フォールバックとしてのみ機能する。詳細は .claude/deployment.md 参照（Issue #002 / #002-B）。
        const { error } = await supabase.auth.resetPasswordForEmail(
          input.email,
          {
            redirectTo: `${context.url.origin}/auth/confirm?next=/auth/update-password`,
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

    /**
     * Issue #002: メールスキャナー対策 (B 案 / 公式推奨) 用の明示的 OTP 確認 Action。
     *
     * Supabase の OTP (`token_hash`) フローはメールリンクを GET でプリフェッチされると
     * 一度きりのトークンが消費されてしまうため、`{{ .ConfirmationURL }}` を直接踏ませずに
     * `/auth/confirm` ランディングページで「続行」ボタンを踏ませ、フォーム POST で検証する。
     *
     * `accept: "form"` なので自動的に CSRF 相当のブラウザ Origin 制約が効く。
     *
     * @see https://supabase.com/docs/reference/javascript/auth-verifyotp
     * @see https://supabase.com/docs/guides/auth/server-side/creating-a-client
     */
    confirmOtp: defineAction({
      accept: "form",
      input: z.object({
        token_hash: z.string().min(1).max(512),
        type: z.enum([
          "invite",
          "recovery",
          "email_change",
          "email",
          "signup",
          "magiclink",
        ]),
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const { error } = await supabase.auth.verifyOtp({
          token_hash: input.token_hash,
          type: input.type,
        });
        if (error) {
          console.error("auth.confirmOtp error", error);
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "リンクが無効または期限切れです",
          });
        }
        return { success: true };
      },
    }),

    /**
     * Issue #002-B: パスワードリセット / 招待直後の新パスワード設定用 Action。
     *
     * Supabase 公式 Password Auth 3-step フローの最終ステップ:
     *   1. resetPasswordForEmail
     *   2. verifyOtp (recovery セッション確立)
     *   3. updateUser({ password })  ← 本 Action
     *
     * OWASP Forgot Password Cheat Sheet に従い、完了後は `signOut` で recovery セッションを
     * 即切りにし、ユーザーに新パスワードでの再ログインを強制する
     * （メールを盗み見た攻撃者が長期セッションを取得するのを防ぐ）。
     *
     * @see https://supabase.com/docs/guides/auth/passwords
     * @see https://supabase.com/docs/reference/javascript/auth-updateuser
     * @see https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
     */
    updatePassword: defineAction({
      accept: "form",
      input: z.object({
        password: passwordSchema,
      }),
      handler: async (input, context) => {
        // HIBP 漏洩パスワードチェック（ENABLE_HIBP_CHECK=true の場合のみ）
        await assertNotPwned(input.password);

        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });

        // recovery / invite フローでは verifyOtp によって一時的な認証済みセッションが
        // 確立されている前提。セッションが無い状態での呼び出しは拒否する。
        const user = await getAuthUser(supabase);
        if (!user) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message:
              "セッションが無効です。もう一度リセットメールを送信してください。",
          });
        }

        const { error } = await supabase.auth.updateUser({
          password: input.password,
        });
        if (error) {
          console.error("auth.updatePassword error", error);
          throw new ActionError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }

        // OWASP 推奨: 更新直後に recovery セッションを明示的に切り、
        // 新パスワードでの再ログインを強制する。
        await supabase.auth.signOut();
        return { success: true };
      },
    }),
  },

  storage: {
    /**
     * アバター画像アップロード。
     *
     * 防御多層:
     *   1. クライアント側 (ProfileForm.vue) で MIME / サイズを検証 (UX 向上のみ)
     *   2. Astro Action の Zod .refine で MIME / サイズを早期検証 (400 応答)
     *   3. Supabase Storage バケット設定 (allowed_mime_types / file_size_limit)
     *      が **真の防衛線**。DevTools で 1, 2 を迂回されてもここで拒否される。
     *      → supabase/migrations/001_init.sql (avatars バケット INSERT セクション)
     *
     * 併せて upload() 呼び出し時に contentType を明示指定し、
     * クライアントが送る Content-Type を盲信しない。
     *
     * @see https://supabase.com/docs/guides/storage/buckets/fundamentals
     * @see https://supabase.com/docs/guides/storage/uploads/standard-uploads
     * @see https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
     */
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
        const user = await getAuthUser(supabase);
        if (!user) throw new ActionError({ code: "UNAUTHORIZED" });

        // ファイル名をサニタイズ（Issue #001 / #008）
        // 日本語・絵文字・多言語は保持し、OS / URL で危険な文字と `..` のみ無害化。
        const sanitizedFileName = sanitizeAvatarFileName(input.file.name);
        const filePath = `${user.id}/${Date.now()}_${sanitizedFileName}`;
        const { error } = await supabase.storage
          .from("avatars")
          .upload(filePath, input.file, {
            upsert: true,
            // Zod で検証済みの MIME を明示指定。
            // クライアントが送る Content-Type を盲信しない。
            contentType: input.file.type,
          });

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
      input: z.object({ path: z.string().max(512) }),
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
  // クライアントから user_id を受け取らない（サーバー側の getAuthUser() を信頼）。
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
        const user = await getAuthUser(supabase);
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
        const user = await getAuthUser(supabase);
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
        const user = await getAuthUser(supabase);
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

  // ----------------------------------------------------------------
  // profile
  // RLS（`Users can update own profile`）＋ DB CHECK 制約 (profiles_display_name_length)
  // との多層防御。クライアントからの直接書き込みは禁止し、本 Action に一本化する。
  // Issue #007 参照。
  // ----------------------------------------------------------------
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
        const user = await getAuthUser(supabase);
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

  admin: {
    createUser: defineAction({
      accept: "form",
      input: z.object({
        email: z.string().email().max(254),
        password: passwordSchema,
        displayName: z.string().max(100).optional(),
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
      input: z.object({ email: z.string().email().max(254) }),
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
