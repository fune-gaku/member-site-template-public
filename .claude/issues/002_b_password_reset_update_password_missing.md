# Issue #002-B: パスワードリセット - 新パスワード設定画面と `updateUser` Action が未実装

**作成日**: 2026-04-20
**優先度**: High
**ステータス**: Open
**カテゴリ**: Bug / Auth
**伴走 Issue**: [Issue #002](./002_invite_email_otp_expired.md)（`/auth/confirm` ランディングページの導入）

---

## 本 Issue の位置付け

Issue #002 と **同じメール認証周りの破綻を扱う兄弟 Issue** で、並走で進める前提。分離の根拠は「どちらか片方だけ直してもパスワードリセットは動かない」が「対応スコープが明確に違う」ため:

| Issue      | 扱う範囲                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| **#002**   | メール内リンクが scanner プリフェッチで OTP 消費される問題 → `/auth/confirm` ランディングページ新設 |
| **#002-B** | verifyOtp 後の **新パスワード設定画面と updateUser Action 自体が存在しない** 問題                  |

#002 が完了しても **#002-B を直さなければパスワードリセットは依然として機能しない**（dashboard に飛ばされるだけ）。逆に #002-B を先に実装しても scanner 問題で OTP が消費されて画面まで到達できない。**両方セットで完了が必須**。

---

## 問題の概要

`/auth/reset-password` からリセットメールを送信する部分は実装済みだが、**メール内リンクをクリックした後に「新しいパスワードを設定する」画面と処理が一切存在しない**。Supabase 公式の 3 ステップフローの最後が抜け落ちており、ユーザーは recovery セッションで dashboard に飛ばされるだけで **パスワードを変更できない**。

### 現状の実装

| ステップ | 処理                                                         | 場所                                                                                             | 状態    |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------- |
| 1        | `resetPasswordForEmail(email, { redirectTo })`               | [src/actions/index.ts:111-133](../../src/actions/index.ts#L111-L133)                             | ✅ 実装済  |
| 2        | redirectTo 先で `verifyOtp({ token_hash, type })`            | [src/pages/auth/callback.astro:16-19](../../src/pages/auth/callback.astro#L16-L19)               | ✅ 実装済  |
| 3        | **新パスワードフォーム → `updateUser({ password })` を実行** | **画面・Action とも存在しない**                                                                  | ❌ **未実装** |

### 決定的なコード

**[src/pages/auth/callback.astro:16-19](../../src/pages/auth/callback.astro#L16-L19)**

```astro
if (token_hash && type) {
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (!error) return Astro.redirect("/member/dashboard");  // ← type=recovery でも同じ。パスワード未変更のまま dashboard へ
}
```

[src/components/ProfileForm.vue](../../src/components/ProfileForm.vue) にもパスワード変更 UI は存在しないため、dashboard 到着後にパスワードを変更する手段もない。

---

## 公式ドキュメントが定める正規フロー

### Supabase [Password-based Auth ガイド](https://supabase.com/docs/guides/auth/passwords)

> **Step 1**: `await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'http://example.com/account/update-password' })`
>
> **Step 2**: redirectTo 先で `verifyOtp({ token_hash, type })` を呼び検証
>
> **Step 3 ("Once you have a session")**: パスワード変更ページで新パスワードを収集し、認証済みユーザーコンテキストで
> `await supabase.auth.updateUser({ password: 'new_password' })` を呼ぶ

### メールテンプレート（[auth-email-templates](https://supabase.com/docs/guides/auth/auth-email-templates)）

```
/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password
```

**`{{ .ConfirmationURL }}` 直書きは、email scanner プリフェッチで OTP が消費される問題 ([Issue #002](./002_invite_email_otp_expired.md)) を引き起こす** ため、`{{ .TokenHash }}` ベースのランディングページ方式が公式推奨。

---

## 影響

- **パスワードリセットメールは「何もできないまま dashboard に飛ばされる」状態**：パスワードを忘れたユーザーの最終救済手段が機能しない
- 本番リリース前に必ず直す必要がある（ユーザーサポート負荷が単純に倍増する性質の不具合）
- Issue #002 対応後も、この Issue を直さないとパスワードリセット全体は壊れたまま

---

## 解決策

### 方針

- Issue #002 で導入する `/auth/confirm` ランディングページを **パスワードリセットでも共通利用**する
- `type=recovery` の場合のみ、verifyOtp 成功後に `/auth/update-password` へ遷移させる
- `/auth/update-password` で新パスワードフォームを表示 → Astro Action `auth.updatePassword` から `supabase.auth.updateUser({ password })` を実行
- 完了後はサインイン画面へ誘導し、新パスワードで再ログインしてもらう

### 実装タスク

#### 1. Action 追加: `src/actions/index.ts`

```ts
updatePassword: defineAction({
  accept: "form",
  input: z.object({
    password: passwordSchema, // Issue #006 で切り出した共通スキーマを利用（無ければここで定義）
  }),
  handler: async (input, context) => {
    const supabase = createClient({
      request: context.request,
      cookies: context.cookies,
    });

    // recovery フローは verifyOtp によって認証済みセッションが確立している前提。
    // 未ログイン状態での呼び出しは拒否する。
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

    // セキュリティ観点で recovery セッションを切って強制再ログインさせる
    await supabase.auth.signOut();
    return { success: true };
  },
}),
```

**ポイント**:

- recovery 後の一時セッションを `updateUser` 成功直後に `signOut` することで、**メールを盗み見た攻撃者が長期セッションを取得できなくする**（OWASP Authentication Cheat Sheet 準拠）
- 成功後は「サインイン画面で新パスワードで再ログイン」フローへ誘導

#### 2. 新規ページ: `src/pages/auth/update-password.astro`

```astro
---
import UpdatePasswordForm from "../../components/UpdatePasswordForm.vue";
import Auth from "../../layouts/Auth.astro";

import { createClient } from "../../lib/supabase";

// 直接このページに来た場合（recovery セッション無し）は signin へ戻す
const supabase = createClient({
  request: Astro.request,
  cookies: Astro.cookies,
});
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  return Astro.redirect("/auth/signin?error=recovery_session_required");
}
---

<Auth
  title="新しいパスワードを設定"
  description="リセットを確定するため、新しいパスワードを入力してください"
>
  <UpdatePasswordForm client:load />
</Auth>
```

#### 3. 新規コンポーネント: `src/components/UpdatePasswordForm.vue`

```vue
<script setup lang="ts">
import { actions } from "astro:actions";
import { ref } from "vue";

const password = ref("");
const confirmPassword = ref("");
const isLoading = ref(false);
const error = ref("");
const success = ref(false);

async function handleSubmit() {
  error.value = "";

  if (password.value !== confirmPassword.value) {
    error.value = "パスワードが一致しません";
    return;
  }
  // Issue #006 のポリシーに合わせる（8 文字以上・英大小・数字）
  if (
    password.value.length < 8 ||
    !/[a-z]/.test(password.value) ||
    !/[A-Z]/.test(password.value) ||
    !/\d/.test(password.value)
  ) {
    error.value = "8文字以上・英大文字・英小文字・数字を含めてください";
    return;
  }

  isLoading.value = true;
  try {
    const formData = new FormData();
    formData.append("password", password.value);
    const { error: actionError } = await actions.auth.updatePassword(formData);
    if (actionError) {
      error.value = actionError.message;
    } else {
      success.value = true;
      // 新パスワードで再ログインしてもらう
      setTimeout(() => {
        window.location.href = "/auth/signin?reset=done";
      }, 1500);
    }
  } catch (e) {
    console.error("Update password error:", e);
    error.value = "予期しないエラーが発生しました";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div>
    <div
      v-if="success"
      class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4"
    >
      <p class="text-sm text-green-800">
        パスワードを更新しました。サインイン画面へ移動します...
      </p>
    </div>
    <form v-else class="space-y-6" @submit.prevent="handleSubmit">
      <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 p-4">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>
      <!-- password / confirm password inputs ... -->
      <button
        type="submit"
        :disabled="isLoading"
        class="bg-brand-600 hover:bg-brand-700 w-full rounded-lg px-4 py-3 font-medium text-white transition disabled:opacity-50"
      >
        {{ isLoading ? "更新中..." : "パスワードを更新" }}
      </button>
    </form>
  </div>
</template>
```

#### 4. `/auth/confirm` ランディングページの分岐（Issue #002 と統合）

Issue #002 で導入する `/auth/confirm` の POST ハンドラで、`type` に応じて遷移先を変える:

```ts
// /auth/confirm の POST 後 verifyOtp 成功時
switch (input.type) {
  case "recovery":
    return Astro.redirect("/auth/update-password");
  case "invite":
    return Astro.redirect("/auth/update-password?mode=invite"); // 招待も同じフォームで初回 PW 設定
  case "signup":
  case "email_change":
  case "email":
  default:
    return Astro.redirect("/member/dashboard");
}
```

> Issue #002 の「実装タスク #1」にこの分岐が既に含まれている。本 Issue の作業はその分岐先である `/auth/update-password` の実装に絞られる。

#### 5. reset Action の `redirectTo` を更新

**[src/actions/index.ts:119-124](../../src/actions/index.ts#L119-L124)**

```ts
// Before
redirectTo: `${context.url.origin}/auth/callback?type=recovery`,

// After: /auth/confirm 経由に変更（Issue #002 のランディングページが前提）
redirectTo: `${context.url.origin}/auth/confirm?next=/auth/update-password`,
```

ただし **Supabase Dashboard のメールテンプレート側** で `{{ .TokenHash }}&type=recovery&next=/auth/update-password` を直接組み立てている場合はコード側の `redirectTo` は使われないため、Dashboard 側を真の情報源とする。Issue #002 のタスク #4 参照。

#### 6. Supabase Dashboard: Reset Password メールテンプレート

Authentication → Email Templates → **Reset Password**:

```html
<a
  href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password"
  >パスワードをリセット</a
>
```

- `{{ .ConfirmationURL }}` は使わない（email scanner の OTP 消費回避）
- `next` に `/auth/update-password` を載せて、`/auth/confirm` から自動遷移させる

#### 7. 旧 `/auth/callback` の扱い

Issue #002 の解決策と同じく、PKCE (`code`) 専用として残すか統合するかは任意。`token_hash` フローは `/auth/confirm` へ集約するのが望ましい。

#### 8. テスト: `tests/unit/update-password.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";

const passwordSchema = z
  .string()
  .min(8)
  .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p));

describe("updatePassword input validation", () => {
  it("rejects too short", () => {
    expect(passwordSchema.safeParse("Abc1").success).toBe(false);
  });
  it("rejects missing digit", () => {
    expect(passwordSchema.safeParse("Abcdefgh").success).toBe(false);
  });
  it("accepts strong password", () => {
    expect(passwordSchema.safeParse("NewPass123").success).toBe(true);
  });
});
```

E2E は Supabase Auth の統合テスト環境が必要なので、まずは手動検証手順を `.claude/deployment.md` に記載する。

---

## 受け入れ基準

- [ ] `/auth/reset-password` からメールを送り、メール内リンク（`/auth/confirm?token_hash=...&type=recovery&next=/auth/update-password`）をクリックすると `/auth/update-password` に遷移する
- [ ] `/auth/update-password` で新しいパスワードを入力・送信すると、Supabase 上のパスワードが実際に変更される（DB または `signInWithPassword` で新旧比較し確認）
- [ ] 更新後は recovery セッションが `signOut` で切れ、`/auth/signin?reset=done` へ遷移する
- [ ] 新パスワードで正常にサインインできる
- [ ] 旧パスワードではサインインが失敗する
- [ ] `/auth/update-password` に recovery セッション無しで直接アクセスすると `/auth/signin?error=recovery_session_required` にリダイレクトされる
- [ ] Issue #002 の対応後、email scanner による OTP 消費が発生しない（`curl -I` で token_hash がプリフェッチされても verify されない）
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Supabase: Password-based Auth](https://supabase.com/docs/guides/auth/passwords) — 3 ステップフロー（resetPasswordForEmail → verifyOtp → updateUser）
- [Supabase: resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [Supabase: auth.updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Supabase: verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase: Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) — `{{ .TokenHash }}` 形式で scanner 問題回避
- [Supabase: Server-side Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [OWASP: Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — 完了後の強制再ログイン推奨

---

## 関連 Issue

- [Issue #002](./002_invite_email_otp_expired.md): `/auth/confirm` ランディングページの導入（伴走 Issue）
- [Issue #006](./006_password_policy.md): パスワードポリシー統一（本 Issue のフォームで同じ `passwordSchema` を使う）

---

## ラベル

`bug`, `auth`, `password-reset`, `high-priority`, `paired-with-#002`
