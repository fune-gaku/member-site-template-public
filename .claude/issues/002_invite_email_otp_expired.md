# Issue #002: 招待メールの「Accept the invite」リンクが otp_expired エラーになる

**作成日**: 2026-04-18
**優先度**: High
**ステータス**: Open
**カテゴリ**: Bug / Security

---

## 問題の概要

管理画面（`/admin/users`）から admin が他ユーザーを招待したとき、届いた招待メール内の「Accept the invite」リンクをクリックすると、以下のエラーで弾かれる。

### 実際の遷移先 URL

```
http://localhost:4321/auth/signin?error=auth_failed#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=
```

### 症状

- 一般ユーザーの signup から送られる確認メールのリンクは**正常に動作**する
- 管理者が `admin.inviteUser` で招待したユーザーの招待メールのリンクだけ**常に `otp_expired`** で失敗する
- メール受信直後にクリックしても発生するため、実際の期限切れではない

---

## 原因

メールクライアント / メールセキュリティ製品（Gmail, Outlook, Microsoft Defender Safe Links, 企業 MTA の URL プレビュー等）が **受信メール内の URL を GET でプリフェッチしてスキャン**することにより、ユーザーがクリックする前に OTP (One-Time Password) トークンが消費されてしまう、Supabase 認証の既知の挙動。

### signup が動いて invite が動かない理由

| フロー                   | トークン方式                       | スキャナー耐性                                                                     |
| ------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| signup（ブラウザ起点）   | **PKCE** (`code_verifier`) + `code` | ✅ 耐性あり：code を exchange するにはブラウザ側の code_verifier が必要            |
| admin invite（サーバー起点） | OTP (`token_hash`, `type=invite`)  | ❌ 耐性なし：GET 一発で verify が走り消費される                                    |

admin 招待はサーバー発行のため PKCE の verifier を用意できず、GET で消費される OTP 方式になる。

---

## 影響範囲

- `/admin/users` からの **新規ユーザー招待フローが事実上機能しない**
- 同じく OTP 方式を使う **パスワードリセットメール** (`/auth/reset-password`) も同じ問題を抱える可能性が高い（要検証）
- 本番環境ではメールセキュリティ製品の介在がローカル以上に多いため、**リリース前に必ず対策すべき高優先度の課題**

---

## 解決策（採用: B 案「確認ボタン経由」パターン）

Supabase 公式ガイドが推奨する、**ランディングページ + ユーザー明示クリック** で OTP を消費する方式に変更する。

### 仕組み

1. Supabase のメールテンプレートのリンク先を、アプリの確認ページ (`/auth/confirm`) に変える
2. リンクには `token_hash` と `type` を **クエリパラメータとして載せる**だけで、GET では何もしない
3. 確認ページでユーザーが「続行」ボタンを押すと、**フォーム POST**（または同等の明示的アクション）で `supabase.auth.verifyOtp({ token_hash, type })` を実行
4. メールスキャナーの GET では検証が走らないため、OTP は消費されない

### 実装タスク

#### 1. 新規ページ: `src/pages/auth/confirm.astro`

- GET: `token_hash` と `type` をクエリから取得 → **隠しフィールドに埋め込んだ確認フォーム**を表示（「続行」ボタン）
- POST: `verifyOtp({ token_hash, type })` を実行 → 成功なら:
  - `type === 'invite'` → `/auth/set-password?next=/member/dashboard` にリダイレクト（初回パスワード設定画面へ）
  - `type === 'recovery'` → `/auth/set-password?next=/member/dashboard` にリダイレクト（パスワード再設定）
  - その他 → `/member/dashboard`
- 失敗時は `/auth/signin?error=confirm_failed` にリダイレクト、`console.error` でログ

#### 2. 新規ページ: `src/pages/auth/set-password.astro`

- 招待直後 / パスワードリセット後にパスワードを設定する画面
- `supabase.auth.updateUser({ password })` を Astro Action 経由で呼ぶ
- 既存の reset-password フローと統合できるか検討

#### 3. Actions 追加: `src/actions/index.ts`

```typescript
auth: {
  // ...既存...
  confirmOtp: defineAction({
    accept: "form",
    input: z.object({
      token_hash: z.string().min(1),
      type: z.enum(["invite", "recovery", "email_change", "email", "signup"]),
    }),
    handler: async (input, context) => {
      const supabase = createClient({ ... });
      const { error } = await supabase.auth.verifyOtp({
        token_hash: input.token_hash,
        type: input.type,
      });
      if (error) {
        console.error("auth.confirmOtp error", error);
        throw new ActionError({ code: "BAD_REQUEST", message: "リンクが無効または期限切れです" });
      }
      return { success: true };
    },
  }),
  setPassword: defineAction({
    accept: "form",
    input: z.object({
      password: z.string().min(6),
    }),
    handler: async (input, context) => {
      const supabase = createClient({ ... });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new ActionError({ code: "UNAUTHORIZED" });
      const { error } = await supabase.auth.updateUser({ password: input.password });
      if (error) {
        console.error("auth.setPassword error", error);
        throw new ActionError({ code: "INTERNAL_SERVER_ERROR", message: "パスワードの設定に失敗しました" });
      }
      return { success: true };
    },
  }),
},
```

#### 4. Supabase Dashboard 側の設定変更

**Authentication → Email Templates** で以下を更新:

- **Invite user**
  - Before: `<a href="{{ .ConfirmationURL }}">Accept the invite</a>`
  - After: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept the invite</a>`
- **Confirm signup**（同じ問題を踏まえて揃える）
  - After: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>`
- **Reset password**
  - After: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>`
- **Change Email Address**
  - After: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm email change</a>`

#### 5. 既存 `src/pages/auth/callback.astro` の扱い

- PKCE フロー（`code` クエリ）専用として残す（signup の PKCE フロー用）
- OTP フロー（`token_hash`）は `/auth/confirm` に集約
- もしくは callback.astro も統合してもよいが、「何もしないページ = /confirm」「自動処理 = /callback」と分ける方が分かりやすい

#### 6. ドキュメント更新

- `CLAUDE.md` または `.claude/architecture.md` の「認証フロー」節に、OTP 方式とメールスキャナー対策を追記
- Supabase Dashboard でメールテンプレートを書き換えた内容をスクリーンショット or SQL/設定ファイルで記録（再現性確保）

---

## 受け入れ基準

- [ ] admin が `/admin/users` から招待したユーザーのメールリンクをクリックして、`otp_expired` にならず `/auth/set-password` に遷移できる
- [ ] 新規 signup / パスワードリセットも同じ `/auth/confirm` 経由で統一され、すべて動作する
- [ ] メールスキャナーを想定した `curl -I <リンク>` （GET）を実行しても OTP が消費されないこと（手動で再度クリックしても通る）
- [ ] 既存の PKCE signup フロー（ブラウザ起点）が壊れていない
- [ ] lint / typecheck / test がすべて pass
- [ ] セキュリティチェック（`.claude/security.md`）全項目 OK
- [ ] 既存の `/auth/callback` が PKCE 専用として引き続き動作

---

## 参考資料

- [Supabase: Server-side auth - Creating a client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase: verifyOtp reference](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase: admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Supabase: Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase GitHub Discussions: Email link scanners](https://github.com/supabase/supabase/discussions)（類似事例が多数報告されている）

---

## 注記

- A 案（`admin.generateLink` で独自メール送信）は柔軟性は最も高いが、SMTP 実装と Email テンプレート管理が自前になり負担が大きい。**テンプレート用途では B 案が妥当**
- C 案（自前 SMTP + 自前テンプレート）は A と同様に負担が大きい
- 採用 B 案は、公式ドキュメントでも「Server-Side Auth」セクションで推奨されている
