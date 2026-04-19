# Issue #009: 未接続の「ログイン状態を保持」チェックボックスを削除

**作成日**: 2026-04-20
**優先度**: Medium
**ステータス**: Resolved
**カテゴリ**: UX / UI Cleanup

---

## 問題の概要

サインインフォームに「ログイン状態を保持」チェックボックスが存在するが、**どこにも `v-model` / `name` 属性が繋がっておらず**、状態はフォーム送信にも Supabase の `signIn` 処理にも一切反映されない。

### 該当箇所（修正前）

**[src/components/LoginForm.vue:80-94](../../src/components/LoginForm.vue)**

```vue
<div class="flex items-center justify-between text-sm">
  <label class="flex items-center">
    <input
      type="checkbox"
      class="text-brand-600 focus:ring-brand-500 mr-2 rounded border-gray-300"
    />
    <span class="text-gray-700">ログイン状態を保持</span>
  </label>
  <a href="/auth/reset-password" ...>パスワードを忘れた</a>
</div>
```

---

## なぜ「削除」が正しい対応か

Supabase Auth の [Sessions ガイド](https://supabase.com/docs/guides/auth/sessions) に明記されているとおり、**セッション寿命はプロジェクト単位**（Auth > Sessions の Time-box / Inactivity timeout / Single session）で一元管理される設計であり、**サインインごとに Remember Me を切り替える API は存在しない**。

> "To make sure that users are required to re-authenticate periodically, you can set a positive value for the Time-box user sessions option in the Auth settings for your project."
> — Supabase Docs, *Sessions*

したがって、
- 機能を実装する側に回ると **Supabase 公式と異なる挙動を無理やり作る** ことになり保守性が悪化する
- そもそもユーザーはチェックボックスで何が起きているか分からず **期待値を裏切る**（ダークパターン）

**結論**: チェックボックスは削除し、セッション寿命方針はドキュメント化する。

---

## 実装タスク

### 1. `src/components/LoginForm.vue` の該当 `<label>` を削除

「パスワードを忘れた」リンクのみを右寄せで残す。

```vue
<div class="flex justify-end text-sm">
  <a href="/auth/reset-password" ...>パスワードを忘れた</a>
</div>
```

### 2. 動作確認

- `npm run dev` でサインインページを開き、チェックボックスが消えていること
- 「パスワードを忘れた」リンクが `/auth/reset-password` に遷移すること
- 既存のサインイン動作に影響がないこと

### 3. `.claude/security.md` にセッション寿命方針を追記

- Supabase 公式設計（Remember Me 非サポート、寿命はプロジェクト単位）を明記
- Dashboard > Auth > Sessions の Time-box / Inactivity timeout / Single session を紹介
- 「UI に Remember Me を追加しない」という実装ルールを明文化

---

## 受け入れ基準

- [x] サインイン画面からチェックボックスが消えている
- [x] 「パスワードを忘れた」リンクは右寄せで残り機能する
- [x] `.claude/security.md` にセッション寿命方針の節が追加されている
- [x] typecheck / lint / test pass

---

## 参考資料

- [Supabase Docs - Sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth Settings - Session management](https://supabase.com/docs/guides/auth/auth-session-management)

---

## ラベル

`ux`, `cleanup`, `auth`, `docs`
