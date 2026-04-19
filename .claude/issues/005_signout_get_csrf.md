# Issue #005: `/auth/signout` が GET を受け付けるため CSRF による強制ログアウトが可能

**作成日**: 2026-04-20
**優先度**: Medium
**ステータス**: Open
**カテゴリ**: Security (CSRF)

---

## 問題の概要

サインアウトページが **GET リクエストだけでセッションを破棄する** 実装になっており、第三者サイトからのリンク誘導・`<link rel="prefetch">` ・メーラーの URL プリフェッチ等で **意図しないログアウトを強制できる**（CSRF / CWE-352）。

### 該当箇所

**[src/pages/auth/signout.astro:4](../../src/pages/auth/signout.astro#L4)**

```astro
---
import { actions } from "astro:actions";

if (Astro.request.method === "POST" || Astro.request.method === "GET") {
  const { data, error } = await Astro.callAction(actions.auth.signOut);
  // ...
  return Astro.redirect("/");
}
---
```

**[src/pages/member/dashboard.astro:114](../../src/pages/member/dashboard.astro#L114)**

```astro
<a href="/auth/signout" class="...">
  ...サインアウト...
</a>
```

### 確認済みの挙動

```bash
curl -i -X GET https://member-site-template.fune-gaku.workers.dev/auth/signout
# HTTP/2 302
# location: /
# （Cookie が付いていれば sb-* Cookie が Max-Age=0 で delete される）
```

### 攻撃シナリオ

1. 攻撃者が任意のサイトやメールに以下を埋め込む
   - `<a href="https://target/auth/signout">お得な情報はこちら</a>`
   - `<link rel="prefetch" href="https://target/auth/signout">`（一部ブラウザは Cookie 付きで取得）
   - スパムメール内のリンク（メーラーの URL スキャナーが GET する）
2. 被害者がリンクをクリック / メールを開いた瞬間に **意図せずログアウト**
3. 長時間作業中のユーザーは入力中のフォームや未保存データを失う

### Supabase Cookie の `SameSite=Lax` でも防げない

`SameSite=Lax` は **トップレベル GET ナビゲーション** には Cookie を送るため、`<a href>` クリックや `window.open` による遷移では依然として Cookie が送信され、ログアウトが成立する。`<img>` や `fetch` は弾けるが、**リンククリックベースの CSRF は弾けない**。

---

## 影響

- **機能的影響**: 低〜中（ログイン状態がクリアされるだけで権限昇格には直結しない）
- **UX 影響**: 中〜高（入力中データ喪失、再ログイン負荷、サポート問い合わせ増）
- **原則違反**: [RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1) の "safe methods" 原則（GET はサーバ状態を変更してはならない）に違反

---

## 解決策

### 方針

**Astro Actions は既に POST 限定 かつ Origin チェック（`security.checkOrigin` デフォルト `true`）を備えている** ため、サインアウトを Action のフォーム POST に寄せるのが最もシンプルで堅牢。

Astro 6 公式ドキュメントの推奨パターン: `<form method="POST" action={actions.auth.signOut}>`。これにより:

- GET ではログアウトできない（405 Method Not Allowed）
- クロスオリジン POST は Astro の `security.checkOrigin` が 403 で弾く（[curl で確認済み](../issues/_audit_notes.md)）
- ボタン UI でも違和感がない

### 実装タスク

#### 1. `src/pages/auth/signout.astro` を削除

ページとしてのルートは不要になる。代わりに Action `actions.auth.signOut` を直接フォームから呼ぶ。

（互換のため残す場合は **POST 限定 + 405 応答** に変更）:

```astro
---
import { actions } from "astro:actions";

if (Astro.request.method !== "POST") {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

await Astro.callAction(actions.auth.signOut);
return Astro.redirect("/");
---
```

#### 2. ダッシュボードのリンクをフォーム POST に差し替え: `src/pages/member/dashboard.astro`

```astro
---
import { actions } from "astro:actions";
// ...
---

<form method="POST" action={actions.auth.signOut} class="contents">
  <button
    type="submit"
    class="flex w-full items-center rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50"
  >
    <div class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
      <!-- 既存の SVG アイコン -->
    </div>
    <div>
      <div class="font-medium text-gray-900">サインアウト</div>
      <div class="text-sm text-gray-600">ログアウト</div>
    </div>
  </button>
</form>
```

Astro Actions の `<form action={actions.auth.signOut}>` は:

- ビルド時に `action="/_actions/auth.signOut"` と `method="POST"` に展開される
- 成功時は Action ハンドラで `return Astro.redirect("/")` させるか、またはフォーム直後で `Astro.getActionResult()` を見て遷移させる

#### 3. Action 側でリダイレクトさせる: `src/actions/index.ts`

```ts
signOut: defineAction({
  accept: "form",
  handler: async (_, context) => {
    const supabase = createClient({
      request: context.request,
      cookies: context.cookies,
    });
    await supabase.auth.signOut();
    return { success: true };
  },
}),
```

`handler` は値を返すのみにして、リダイレクトはフォーム呼び出し側で行うのが Astro の作法。

#### 4. ダッシュボード以外のサインアウトリンク探索

```bash
npm run lint -- --no-fix | grep -i signout
grep -rn "/auth/signout" src/
```

見つかった全ての `<a href="/auth/signout">` を form POST に置き換える。

#### 5. CSRF 検証スクリプト（手動確認）

```bash
# 攻撃者視点: クロスオリジン GET（ログイン済み Cookie 付きを模擬）
curl -i -X GET https://member-site-template.fune-gaku.workers.dev/auth/signout
# 期待: 405 Method Not Allowed（または「サインアウトページ」としてフォーム表示のみ）

# 攻撃者視点: クロスオリジン POST
curl -i -X POST -H "Origin: https://evil.example.com" \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: 403 Forbidden（Astro security.checkOrigin が拒否）

# 同一オリジン POST（正規フロー）
curl -i -X POST -H "Origin: https://member-site-template.fune-gaku.workers.dev" \
  -H "Referer: https://member-site-template.fune-gaku.workers.dev/member/dashboard" \
  https://member-site-template.fune-gaku.workers.dev/_actions/auth.signOut
# 期待: 200（Cookie が付いていればセッション削除）
```

---

## 受け入れ基準

- [ ] `curl -X GET /auth/signout` が **405 Method Not Allowed** を返す（またはルート自体が存在しない）
- [ ] 管理画面・ダッシュボードの「サインアウト」UI がクリック 1 回で従来どおりサインアウトできる
- [ ] クロスオリジン POST が **403** で拒否される（`security.checkOrigin` の動作確認）
- [ ] スパムメールの URL スキャナーが GET しても Cookie 削除が走らない（手動 curl で確認）
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Astro: Actions (forms and mutations)](https://docs.astro.build/en/guides/actions/)
- [Astro: Configuration Reference - security.checkOrigin](https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin)
- [OWASP: Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 9110 §9.2.1 Safe Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1)
- [Supabase: auth.signOut](https://supabase.com/docs/reference/javascript/auth-signout)

---

## ラベル

`security`, `csrf`, `medium-priority`
