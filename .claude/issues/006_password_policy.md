# Issue #006: パスワードポリシーが弱い（最小長 6 文字、漏洩チェック無し）

**作成日**: 2026-04-20
**優先度**: Low
**ステータス**: Open
**カテゴリ**: Security (Auth)

---

## 問題の概要

ユーザー登録および管理者によるユーザー作成の Zod スキーマが **`password: z.string().min(6)`** となっており、NIST SP 800-63B / OWASP ASVS / Supabase 公式ガイドが推奨する **8 文字以上**、および漏洩パスワード拒否（Pwned Passwords）を下回る。

### 該当箇所

| 場所                                                                            | 現状               |
| ------------------------------------------------------------------------------- | ------------------ |
| [src/actions/index.ts:51](../../src/actions/index.ts#L51) - `auth.signUp`       | `password.min(6)`  |
| [src/actions/index.ts:347](../../src/actions/index.ts#L347) - `admin.createUser` | `password.min(6)`  |
| [src/components/SignupForm.vue:20-22](../../src/components/SignupForm.vue#L20-L22) | クライアント側も 6 文字 |

### Supabase 公式の推奨（[Password Security ガイド](https://supabase.com/docs/guides/auth/password-security)）

> "Anything less than 8 characters is not recommended."
>
> 複雑性要件は "digits, lowercase and uppercase letters, and symbols" の 4 種類すべてを必須にするのが最も強い。
>
> "Prevent the use of leaked passwords" として HaveIBeenPwned.org Pwned Passwords API 連携を推奨。

---

## 影響

- **ブルートフォース / 辞書攻撃への耐性が不足**
  - 6 文字 の英小文字 + 数字 → 約 20 億通り（2^31 程度）。GPU 1 台で数時間〜数日で全探索可能
  - 8 文字にすれば約 2.8 兆通り（2^41 程度）で現実的な総当たりが困難
- **Credential stuffing への脆弱性**
  - 他サイトで漏洩済みのパスワードをそのまま利用されるリスクが残存
- テンプレート利用者が 6 文字のまま本番投入するとコンプライアンス監査（ISO27001 / SOC2 等）で指摘される

---

## 解決策

### 方針

**アプリケーション層（Zod）と Supabase Auth 層の両方**で 8 文字以上を要求し、Supabase Dashboard（Pro 以上）では Pwned Passwords 連携を有効化する。Free プラン利用者のために **アプリ側の Zod 検証でも HaveIBeenPwned API オプショナル連携** を用意しておく。

### 実装タスク

#### 1. Zod スキーマの最小値を 8 に変更

**[src/actions/index.ts](../../src/actions/index.ts)**

```ts
// 共通スキーマを定義
const passwordSchema = z
  .string()
  .min(8, "パスワードは8文字以上で入力してください")
  .max(72, "パスワードは72文字以下で入力してください") // bcrypt 上限
  .refine(
    (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw),
    "英大文字・英小文字・数字を各1文字以上含めてください",
  );

// auth.signUp
input: z.object({
  email: z.string().email(),
  password: passwordSchema,
}),

// admin.createUser
input: z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().max(100).optional(),
}),
```

#### 2. フロントエンド側のバリデーションも揃える

**[src/components/SignupForm.vue](../../src/components/SignupForm.vue)**

```ts
if (password.value.length < 8) {
  error.value = "パスワードは8文字以上で入力してください";
  return;
}
if (!/[a-z]/.test(password.value) ||
    !/[A-Z]/.test(password.value) ||
    !/\d/.test(password.value)) {
  error.value = "英大文字・英小文字・数字を各1文字以上含めてください";
  return;
}
```

プレースホルダ文言も `"8文字以上・英大小文字・数字を含む"` に更新。

#### 3. Supabase Dashboard 側の設定（テンプレート利用者向けドキュメント）

**`.claude/deployment.md` に追記** する手順:

1. **Authentication → Policies → Password Requirements**
   - Minimum password length: **8**
   - Password strength: `"Lowercase, uppercase, digits, and symbols"` を選択（ASVS L2 相当）
2. **Authentication → Attack Protection → Leaked Password Protection**（Pro Plan 以上）
   - `Enable leaked password protection` を **ON**
   - これで Supabase 側で HaveIBeenPwned API 連携が有効になる
3. Free プランの場合は下記 4 番のアプリ層での HIBP 連携を推奨

#### 4. （オプション）アプリ層での HIBP k-Anonymity チェック

Supabase Free プラン利用者向けに、サインアップ時だけアプリ側で Pwned Passwords API を叩く helper を用意。

**`src/lib/pwned-password.ts`**（新規）

```ts
/**
 * HaveIBeenPwned Pwned Passwords API (k-Anonymity) を使って
 * パスワードが既知の漏洩リストに含まれているか確認する。
 *
 * プライバシー配慮: SHA-1 の最初 5 文字のみを API に送る（k-Anonymity モデル）。
 * 残りの 35 文字で自前マッチするため、平文パスワードや完全なハッシュは外部に送られない。
 *
 * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
 */
export async function isPasswordPwned(password: string): Promise<boolean> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  const res = await fetch(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    {
      // Cloudflare Workers 上で実行される想定
      headers: { "Add-Padding": "true" },
    },
  );
  if (!res.ok) {
    // API 障害時はフェイルオープン（登録をブロックしない）
    console.error("HIBP API error", res.status);
    return false;
  }
  const body = await res.text();
  return body
    .split("\n")
    .some((line) => line.split(":")[0].trim() === suffix);
}
```

Action 側で呼び出し:

```ts
// auth.signUp / admin.createUser の handler 内
if (await isPasswordPwned(input.password)) {
  throw new ActionError({
    code: "BAD_REQUEST",
    message: "このパスワードは過去の漏洩データに含まれています。別のパスワードを使用してください。",
  });
}
```

**Cloudflare Workers の `global_fetch_strictly_public` 互換性**: `api.pwnedpasswords.com` は公開エンドポイントなので互換あり（[wrangler.jsonc:3](../../wrangler.jsonc#L3) の flag 下でも動作）。

#### 5. テストケース

**`tests/password-policy.test.ts`**（新規）

```ts
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { passwordSchema } from "../src/lib/password-schema"; // 2 で切り出す

describe("passwordSchema", () => {
  it.each([
    "Short1",              // 6 文字 - 短すぎ
    "alllowercase1",       // 大文字なし
    "ALLUPPERCASE1",       // 小文字なし
    "NoDigitsAtAll",       // 数字なし
  ])("rejects weak password: %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it.each([
    "StrongPass1",
    "Secure123Abc",
    "MyP@ssw0rd2026",
  ])("accepts strong password: %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  it("rejects over-72-char passwords (bcrypt limit)", () => {
    const pw = "A1" + "a".repeat(71);
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});
```

---

## 受け入れ基準

- [ ] `auth.signUp` / `admin.createUser` とも **8 文字未満を Zod で拒否** する
- [ ] フロント側の早期バリデーションも揃っている
- [ ] （Pro プラン）Supabase Dashboard で Leaked Password Protection が ON
- [ ] （Free プラン）`isPasswordPwned` 経由で HIBP チェックが動作（テストアカウントで `password123` 等が拒否される）
- [ ] `.claude/deployment.md` に Supabase Dashboard 設定手順が記載されている
- [ ] `password-policy.test.ts` が green
- [ ] typecheck / lint / test pass

---

## 参考資料

- [Supabase: Password Security](https://supabase.com/docs/guides/auth/password-security)
- [NIST SP 800-63B §5.1.1](https://pages.nist.gov/800-63-3/sp800-63b.html#memsecretver)
- [OWASP ASVS V2.1 Password Security](https://owasp.org/www-project-application-security-verification-standard/)
- [HaveIBeenPwned Pwned Passwords API (k-Anonymity)](https://haveibeenpwned.com/API/v3#PwnedPasswords)
- [Troy Hunt: Passwords Evolved](https://www.troyhunt.com/passwords-evolved-authentication-guidance-for-the-modern-era/)

---

## ラベル

`security`, `auth`, `password-policy`, `low-priority`
