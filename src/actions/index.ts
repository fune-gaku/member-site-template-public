import { z } from "astro/zod";
import { defineAction, ActionError } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { env } from "cloudflare:workers";

import { performChangePassword } from "../lib/auth-change-password";
import { getAuthUser } from "../lib/auth-claims";
import { performDeleteUser } from "../lib/auth-delete-user";
import { performResetPassword } from "../lib/auth-reset-password";
import { performSignIn } from "../lib/auth-signin";
import {
  isGoogleAuthEnabled,
  performSignInWithGoogle,
} from "../lib/auth-signin-google";
import { performSignUp } from "../lib/auth-signup";
import {
  ALLOWED_AVATAR_MIME,
  MAX_AVATAR_SIZE,
  sanitizeAvatarFileName,
} from "../lib/avatar-upload";
import { logger } from "../lib/logger";
import { passwordSchema } from "../lib/password-schema";
import { isHibpCheckEnabled, isPasswordPwned } from "../lib/pwned-password";
import { safeNextPath } from "../lib/safe-redirect";
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
 *
 * 認証は `getAuthUser` (= `auth.getClaims`、Supabase 公式の最新推奨) を使う。
 * asymmetric signing key 設定時はローカル検証になるため、Auth サーバ側の
 * アカウント停止 / 別端末 sign-out 等の失効は JWT 寿命まで反映されない。
 * 公式は "Most applications rarely need such strong guarantees. Consider
 * adjusting the JWT expiry time to an acceptable value." と明記しており、
 * 本テンプレは JWT 寿命を運用で短く設定することで失効ラグを許容範囲に収める
 * 方針 (.claude/deployment.md「Supabase Auth: JWT 寿命とセッション設定」)。
 *
 * Role 変更は profile.role を毎リクエスト DB から読むため即時反映される
 * (admin → member 降格は遅延なし)。残るギャップはアカウント停止 / sign-out の
 * 即時反映で、公式 strong validation pattern (auth.sessions check) は
 * Issue #23 で別途追跡。
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
    logger.error("requireAdmin: profile load error", error);
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "権限情報の取得に失敗しました",
    });
  }
  if (profile.role !== "admin") {
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
        email: z.email().max(254),
        password: passwordSchema,
      }),
      // 本体は `src/lib/auth-signup.ts` の `performSignUp` に分離してある。
      // Issue #14 (A3 follow-up): Supabase が返す `User already registered`
      // を含む全失敗ケースを統一成功メッセージに正規化し、メール存在判定を
      // 防ぐ。HIBP の事前検証 BAD_REQUEST はバリデーション失敗 (enumeration
      // vector ではない) なので通常通りユーザに返す。
      handler: async (input, context) => {
        // 漏洩パスワードチェック（ENABLE_HIBP_CHECK=true の場合のみ）
        await assertNotPwned(input.password);

        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        return performSignUp(supabase, {
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: `${context.url.origin}/auth/callback`,
          },
        });
      },
    }),

    signIn: defineAction({
      accept: "form",
      input: z.object({
        email: z.email().max(254),
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
        return performSignIn(supabase, {
          email: input.email,
          password: input.password,
        });
      },
    }),

    /**
     * Issue #49: Google OAuth ログイン (PKCE フロー) を開始する Action。
     *
     * `PUBLIC_GOOGLE_AUTH_ENABLED=true` のときのみ受け付け、未設定 / `false` では
     * 多層防御として `NOT_FOUND` を投げる。**真の防衛線は Supabase Dashboard 側で
     * Google provider が有効化されていること**で、Action の env チェックは UI が
     * 隠れていてもブラウザから直接叩かれた場合の追加防御層。
     *
     * 振る舞い:
     *   1. `next` を `safeNextPath` でサニタイズ（Open Redirect / CWE-601 対策）
     *   2. `${origin}/auth/callback?next=<sanitized>` を `redirectTo` に指定して
     *      `signInWithOAuth({ provider: 'google' })` を呼ぶ
     *   3. 返ってきた authorization URL を `{ url }` として返す
     *
     * caller (signin.astro / signup.astro / PR 3 で実装) は `Astro.getActionResult`
     * で `{ url }` を受け取り、`Astro.redirect(url)` で Google にリダイレクトする。
     * Google → Supabase Auth (`<project-ref>.supabase.co/auth/v1/callback`) →
     * アプリ `/auth/callback?code=...&next=...` の順にリダイレクトされ、
     * 既存 callback.astro の `exchangeCodeForSession` で session 確立 → next へ遷移。
     *
     * @see https://supabase.com/docs/guides/auth/social-login/auth-google?framework=astro
     * @see .claude/deployment-optional.md「Google OAuth セットアップ（任意）」
     */
    signInWithGoogle: defineAction({
      accept: "form",
      input: z.object({
        next: z.string().max(1024).optional(),
      }),
      handler: async (input, context) => {
        if (!isGoogleAuthEnabled(import.meta.env.PUBLIC_GOOGLE_AUTH_ENABLED)) {
          throw new ActionError({
            code: "NOT_FOUND",
            message: "ページが見つかりません",
          });
        }

        const sanitizedNext = safeNextPath(input.next);
        const callbackUrl = `${context.url.origin}/auth/callback?next=${encodeURIComponent(sanitizedNext)}`;
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        return performSignInWithGoogle(supabase, {
          redirectTo: callbackUrl,
        });
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
      input: z.object({
        email: z.email().max(254),
      }),
      // 本体は `src/lib/auth-reset-password.ts` の `performResetPassword` に分離してある。
      // Issue #14 (A3 follow-up): 未登録メール / SMTP 失敗 / レート超過の各失敗ケースを
      // 統一成功メッセージに正規化し、登録有無を判定不能にする。
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        // NOTE: 真の情報源は Supabase Dashboard の Email Templates 設定。
        // Dashboard のテンプレート (例: `{{ .SiteURL }}/auth/confirm?token_hash=...&type=recovery&next=/auth/update-password`)
        // がリンクを生成するため、本 redirectTo は Dashboard 側でテンプレートが未設定の場合の
        // フォールバックとしてのみ機能する。詳細は .claude/deployment.md 参照（Issue #002 / #002-B）。
        return performResetPassword(supabase, {
          email: input.email,
          options: {
            redirectTo: `${context.url.origin}/auth/confirm?next=/auth/update-password`,
          },
        });
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
          logger.error("auth.confirmOtp error", error);
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
          logger.error("auth.updatePassword error", error);
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

    /**
     * Issue #19: ログイン中ユーザー自身による日常的なパスワード変更経路。
     *
     * `auth.updatePassword` (recovery / invite フロー) との分離理由:
     *   - recovery はメール所有が認証要素なので「現パスワード再認証」は概念上不要
     *   - 日常変更は盗難 Cookie / 共有 PC 攻撃を抑止するため再認証が必須
     *     (OWASP Authentication Cheat Sheet / NIST SP 800-63B §5.2.10)
     *
     * 振る舞いは `src/lib/auth-change-password.ts` の `performChangePassword` に
     * 分離してテスト可能にしている。
     */
    changePassword: defineAction({
      accept: "form",
      input: z.object({
        currentPassword: z.string().min(1).max(72),
        newPassword: passwordSchema,
      }),
      handler: async (input, context) => {
        const supabase = createClient({
          request: context.request,
          cookies: context.cookies,
        });
        const user = await getAuthUser(supabase);
        if (!user?.email) {
          throw new ActionError({
            code: "UNAUTHORIZED",
            message: "ログインしてください",
          });
        }

        // HIBP 漏洩パスワードチェック（ENABLE_HIBP_CHECK=true の場合のみ）。
        // 再認証より前に実行することで、現パスワードを Auth サーバに送る前に
        // 弱い新パスワードを弾ける（Auth ラウンドトリップ削減）。
        await assertNotPwned(input.newPassword);

        return performChangePassword(supabase, {
          email: user.email,
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
        });
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
        const filePath = `${user.id}/${Date.now().toString()}_${sanitizedFileName}`;
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
          logger.error("posts.create error", error);
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
        id: z.uuid(),
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
          // PostgREST PGRST116 = `.single()` で 0 行（= 自分の投稿で id 一致なし）。
          // 401/403 と区別できる NOT_FOUND を返す。RLS バイパス済み (.eq("user_id", user.id)) の防御層は別途維持。
          if (error.code === "PGRST116") {
            throw new ActionError({
              code: "NOT_FOUND",
              message: "対象の投稿が見つかりませんでした",
            });
          }
          logger.error("posts.update error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "投稿の更新に失敗しました",
          });
        }
        return { post: data };
      },
    }),

    delete: defineAction({
      input: z.object({
        id: z.uuid(),
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
          logger.error("posts.delete error", error);
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
          logger.error("profile.update error", error);
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
        email: z.email().max(254),
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
      input: z.object({ email: z.email().max(254) }),
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
          logger.error("admin.listUsers error", error);
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
            logger.error("admin.listUsers profiles error", profilesError);
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: "プロフィール情報の取得に失敗しました",
            });
          }
          interface ProfileRow {
            user_id: string;
            role: string;
            display_name: string | null;
          }
          const rows = profiles as ProfileRow[];
          profilesById = new Map(
            rows.map((p) => [
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
            role,
            createdAt: u.created_at,
          };
        });

        return { users };
      },
    }),

    updateUserRole: defineAction({
      input: z.object({
        userId: z.uuid(),
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
          logger.error("admin.updateUserRole error", error);
          throw new ActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ロールの更新に失敗しました",
          });
        }
        return { success: true };
      },
    }),

    /**
     * Issue #14: admin による他ユーザーの hard delete。
     *
     * GDPR 第 17 条 / 個人情報保護法 第 35 条（消去請求）への defensive 対応。
     * 多層防御:
     *   - `requireAdmin` で role を検証
     *   - 自分自身の userId は FORBIDDEN（誤操作防止 / 唯一の admin が自分を消す事故を抑止）
     *   - Storage avatars/<userId>/ を先に削除（owner constraint 回避、Supabase 公式）
     *   - `auth.users` から hard delete → `profiles` / `member_posts` は cascade で連鎖削除
     *
     * self-service（ユーザー自身による削除）は別 Issue で追加予定。
     */
    deleteUser: defineAction({
      input: z.object({
        userId: z.uuid(),
      }),
      handler: async (input, context) => {
        const caller = await requireAdmin(context);

        if (caller.id === input.userId) {
          throw new ActionError({
            code: "FORBIDDEN",
            message: "自分自身のアカウントは削除できません",
          });
        }

        const supabaseAdmin = createAdminClient();
        // TODO(Issue #16): 監査ログマージ後に logAudit("admin.user_deleted", ...) を追加
        return performDeleteUser(supabaseAdmin, { userId: input.userId });
      },
    }),
  },
};
