# Issue #009: サインイン画面の「ログイン状態を保持」チェックボックスが機能していない

**作成日**: 2026-04-20
**優先度**: Low
**ステータス**: Open
**カテゴリ**: Bug / UX

---

## 問題の概要

サインイン画面に **「ログイン状態を保持」チェックボックス** が表示されているが、実装としては完全に飾りで、どこにも状態が接続されていない。ユーザーがチェックを入れても/外しても、サインイン後の挙動は一切変化しない。

### 該当箇所

**[src/components/LoginForm.vue:80-87](../../src/components/LoginForm.vue#L80-L87)**

```vue
<div class="flex items-center justify-between text-sm">
  <label class="flex items-center">
    <input
      type="checkbox"
      class="text-brand-600 focus:ring-brand-500 mr-2 rounded border-gray-300"
    />
    <span class="text-gray-700">ログイン状態を保持</span>
  </label>
  <a href="/auth/reset-password" class="...">パスワードを忘れた</a>
</div>
```

- `v-model` が付いていない
- `name` 属性が無い（FormData に含まれない）
- `handleSubmit` 内からも参照されていない
- サーバ側 `auth.signIn` Action の Zod スキーマにも該当フィールドが無い

---

## 影響

- **機能不全 UI の混入**：ユーザーは「チェックすれば保持される」と誤解するが、実際には何も起きない
- **テンプレート利用者の混乱**：このテンプレートをベースに実装する開発者が、既存実装を正とみなして触らないまま本番投入するリスク
- **信頼性の低下**：一箇所でも「動くように見えて動かない」UI があると、テンプレート全体への信頼を損ねる

---

## 解決策: チェックボックスを削除する

### 公式ドキュメントの裏付け

Supabase Auth の [Sessions ガイド](https://supabase.com/docs/guides/auth/sessions) の設計方針は以下のとおりで、**ユーザー単位の Remember Me はサポート対象外**であることが明記されている。

| 項目                               | Supabase 公式の立場                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| セッション寿命の制御               | **プロジェクト全体の単一設定**（JWT expiry / Inactivity timeout / Time-boxed sessions）    |
| ユーザーごとの `maxAge` 上書き     | **非推奨、実装ガイダンスなし**                                                             |
| `signInWithPassword` のオプション  | Remember Me 相当のオプションは存在しない                                                   |
| `@supabase/ssr` の `setAll` 経由  | 公式パターンは存在せず、独自実装が必要（ログイン前にフラグを渡す標準手段もない）           |

> Sessions ガイド（抜粋）:
> - 「Session lifetime is a project-wide setting」
> - 「Per-user maxAge configuration is not recommended」

また、`@supabase/ssr` は **HttpOnly Cookie を Supabase が自前で管理する設計** であり、ログイン時のフラグで Cookie 寿命を分岐させるのはミドルウェア層の独自拡張となる。テンプレートに載せるには過剰な実装負担であり、メンテナンス負債になる。

### 実装タスク

#### 1. チェックボックス行を削除: `src/components/LoginForm.vue`

現状の `div.flex.items-center.justify-between.text-sm` を、**「パスワードを忘れた」リンクだけ残す** 形に変更する。

```vue
<!-- Before: チェックボックス + パスワードを忘れたの 2 カラム -->
<div class="flex items-center justify-between text-sm">
  <label class="flex items-center">
    <input type="checkbox" class="..." />
    <span class="text-gray-700">ログイン状態を保持</span>
  </label>
  <a href="/auth/reset-password" class="...">パスワードを忘れた</a>
</div>

<!-- After: 「パスワードを忘れた」リンクのみ右寄せ -->
<div class="text-right text-sm">
  <a
    href="/auth/reset-password"
    class="text-brand-600 hover:text-brand-700 font-medium"
  >
    パスワードを忘れた
  </a>
</div>
```

#### 2. 動作確認

```bash
npm run dev
# → http://localhost:4321/auth/signin でチェックボックスが表示されていないこと
# → 「パスワードを忘れた」リンクは従来どおり /auth/reset-password へ遷移すること
# → サインインの正常系・異常系ともに従来どおり動作すること
```

#### 3. （任意）将来 Remember Me を実装したくなった時のための注記を README に残す

`.claude/architecture.md` の認証フロー節、または `.claude/security.md` に 1 行追記:

```markdown
## セッション寿命

- セッション寿命は Supabase プロジェクト設定（JWT expiry / Inactivity timeout）で一括管理する
- 公式が「Remember Me」をサポートしていないため、UI 上のトグルは実装しない
- 変更が必要な場合は Supabase Dashboard → Authentication → Sessions で調整する
```

---

## 受け入れ基準

- [ ] サインイン画面に「ログイン状態を保持」チェックボックスが表示されない
- [ ] 「パスワードを忘れた」リンクは従来どおり機能する
- [ ] サインインの正常系（成功→dashboard）、異常系（失敗→エラー表示）ともに変化なし
- [ ] `.claude/architecture.md` または `.claude/security.md` にセッション寿命管理方針が明記されている
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Supabase: Sessions (公式設計思想)](https://supabase.com/docs/guides/auth/sessions) — "session lifetime is project-wide"
- [Supabase: signInWithPassword API リファレンス](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) — Remember Me オプションは存在しない
- [Supabase: @supabase/ssr Creating a Client](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — `setAll` の Cookie 寿命上書きは公式パターン外

---

## ラベル

`bug`, `ux`, `cleanup`, `low-priority`
