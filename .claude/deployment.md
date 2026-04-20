# デプロイ手順

## デプロイ先

**Cloudflare Workers**

{{DEPLOY_TARGET_DESCRIPTION}}

---

## 事前準備

{{DEPLOY_PREREQUISITES}}

---

## 環境変数設定

{{ENV_SETUP_INSTRUCTIONS}}

---

## ビルド設定

{{BUILD_CONFIG}}

---

## デプロイ手順

### 自動デプロイ（推奨）

{{AUTO_DEPLOY_INSTRUCTIONS}}

### 手動デプロイ

{{MANUAL_DEPLOY_INSTRUCTIONS}}

---

## デプロイ確認

{{DEPLOY_VERIFICATION}}

---

## カスタムドメイン設定（オプション）

{{CUSTOM_DOMAIN_SETUP}}

---

## トラブルシューティング

{{DEPLOY_TROUBLESHOOTING}}

---

## パフォーマンス最適化

{{PERFORMANCE_OPTIMIZATION}}

---

## セキュリティ設定

### Supabase Auth: Email Templates（必須 / Issue #002 + #002-B）

Supabase のデフォルトのメールリンク（`{{ .ConfirmationURL }}`）は、Gmail / Outlook / Microsoft Defender Safe Links などのメールスキャナに **GET でプリフェッチ** されると一度きりの OTP が消費されて `otp_expired` を引き起こす。この問題を回避するため、公式推奨の **`{{ .TokenHash }}` ベースのランディングページ方式** に書き換える。

#### 設定場所

Supabase Dashboard → **Authentication → Email Templates**

各テンプレートの HTML 本文の `<a href="{{ .ConfirmationURL }}">...</a>` 箇所を、以下の形式に差し替える。

#### 1. Invite user

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">
  Accept the invite
</a>
```

#### 2. Confirm signup

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">
  Confirm your email
</a>
```

#### 3. Reset password

```html
<a
  href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password"
>
  Reset password
</a>
```

- `next=/auth/update-password` を必ず含める（`/auth/confirm` の POST 成功後に新パスワード設定画面に遷移させるため）。
- `next` は `src/lib/safe-redirect.ts` の `safeNextPath` で同一オリジン内のパスのみ許容される。

#### 4. Change Email Address

```html
<a
  href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change"
>
  Confirm email change
</a>
```

#### 5. Magic Link（使用する場合）

```html
<a
  href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink"
>
  Sign in
</a>
```

#### 重要な注意

- **`{{ .ConfirmationURL }}` は絶対に使わない**（email scanner の OTP プリフェッチ消費を招くため）。
- 上記は **Supabase Dashboard 側が真の情報源**。アプリ側コード（`resetPasswordForEmail` の `redirectTo` や `inviteUserByEmail` の `redirectTo`）はあくまでフォールバック。
- テンプレート変更後は `/auth/reset-password` からリセットメールを送り、届いたメールのリンクを以下の手順で検証する。

#### 動作確認（手動テスト）

```bash
# 1. /auth/reset-password からリセットメールを送信
# 2. 届いたメール内のリンク URL を取得
# 3. スキャナ相当の GET を先に実行
curl -I "https://<your-site>/auth/confirm?token_hash=<...>&type=recovery&next=/auth/update-password"
#    → 200 が返ってページが表示されるだけで OTP は消費されない
# 4. ブラウザで同じ URL を開き「続行」ボタンを押す
#    → POST が走り verifyOtp が成功し、/auth/update-password に遷移する
# 5. 新パスワードを送信 → /auth/signin?reset=done に遷移
# 6. 新パスワードでサインインできる / 旧パスワードは失敗する
```

#### チェックリスト

- [ ] `/auth/reset-password` → メール → リンククリック → `/auth/update-password` に遷移する
- [ ] 新パスワードを送信 → Supabase 上で実際にパスワードが更新される
- [ ] 更新後は `/auth/signin?reset=done` に遷移、旧パスワードではログインできない
- [ ] `/admin/users` → 招待 → メールリンククリック → `/auth/update-password?mode=invite` に遷移する
- [ ] `curl -I "<メール内リンク>"` 後にブラウザで開いても OTP が消費されていない（`otp_expired` にならない）
- [ ] `/auth/update-password` に recovery セッション無しで直接アクセス → `/auth/signin?error=recovery_session_required` にリダイレクトされる

> 参考:
>
> - [Supabase: Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
> - [Supabase: verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
> - [Supabase: Server-side Auth](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
> - [OWASP: Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

---

### Supabase Auth: SMTP (Resend) 設定（本番必須）

Supabase のビルトイン SMTP は開発用で極端に低いレートに制限されているため、本番では必ず Custom SMTP に切り替える。本テンプレートでは **Resend** を採用する。前節の Email Templates は `{{ .TokenHash }}` + `/auth/confirm` 方式のまま変更不要で、メール配送経路のみを差し替える。

#### 1. Resend 側の事前準備

1. `https://resend.com` にサインアップ。
2. **Domains → Add Domain** で送信用ドメインを追加（送信評判を隔離するためサブドメイン推奨。例: `mail.example.com`）。
3. Resend が提示する **SPF (TXT)** と **DKIM (TXT)** レコードを DNS に追加 → **Verify DNS Records** でステータスが `verified` になるまで待機（伝播に最大 72 時間）。
4. **DMARC (TXT)** は Resend の UI からは設定できず、**自ドメインの DNS に自分で追加** する（Resend 公式: "DMARC is added to a domain through a TXT record added to the domain at `_dmarc`"）。最初は `p=none;` から始め、十分にテストしてから `p=quarantine;` へ段階移行する。

   ```
   Name:  _dmarc.mail.example.com
   Type:  TXT
   Value: v=DMARC1; p=none; rua=mailto:dmarc@example.com
   ```

5. **API Keys → Create API Key**（Sending access でよい）で `re_xxx...` を発行。これが SMTP のパスワードになる。

#### 2. Resend SMTP 接続情報（公式値）

| 項目     | 値                                                   |
| -------- | ---------------------------------------------------- |
| Host     | `smtp.resend.com`                                    |
| Port     | `465`（Implicit SSL/TLS）推奨、または `587` STARTTLS |
| Username | `resend`（固定）                                     |
| Password | Resend API Key（`re_...`）                           |

#### 3. Supabase Dashboard で Custom SMTP を有効化

##### 自動設定（推奨）

Resend Dashboard → **Settings → Integrations → Supabase → Connect** で対象 Supabase プロジェクトを選択すると、Custom SMTP 設定が自動注入される。

##### 手動設定

Supabase Dashboard → **Authentication → Emails → SMTP Settings**:

1. **Enable Custom SMTP** を ON
2. **Sender email**: Resend で検証済みドメインのアドレス（例: `no-reply@mail.example.com`）
3. **Sender name**: 任意（例: `会員サイト事務局` — UTF-8 日本語可）
4. Host `smtp.resend.com` / Port `465` / Username `resend` / Password = Resend API Key → **Save**

> **重要**: `Sender email` のドメインと Resend で `verified` になっているドメインが **一致していないと Resend 側で送信拒否** される。

#### 4. レート制限の引き上げ

Custom SMTP を有効化しても、Supabase の初期値は **30 通/時間** に抑えられている（Supabase 公式: "a low rate-limit of 30 messages per hour is imposed"）。**Authentication → Rate Limits → Rate limit for sending emails** を Resend プランの上限内で必要分まで引き上げる。

#### 5. 動作確認（手動テスト）

1. ステージング環境の実メールアドレスで `/auth/signup` または `/auth/reset-password` を実行。
2. Resend Dashboard → **Logs / Emails** で拒否理由（`domain_not_verified` / `from_not_allowed` 等）がないか確認。
3. Supabase Dashboard → **Logs → Auth Logs** で SMTP 4xx/5xx・レート超過がないか確認。
4. 受信メールのリンクに対して前節のスキャナ耐性チェック（`curl -I` → ブラウザで「続行」）を実行し、OTP が 1 度目の GET で消費されないことを確認。
5. `mail-tester.com` などでスコアを確認（SPF / DKIM / DMARC が揃えば 10/10 を狙える）。

#### 6. チェックリスト

- [ ] Resend Domains で使用ドメインが `verified`（SPF / DKIM pass）
- [ ] DNS に `_dmarc.<domain>` の TXT レコードを追加済み（まず `p=none;`）
- [ ] Resend API Key を発行し、Supabase の SMTP Password に設定済み
- [ ] Supabase `Sender email` のドメインと Resend の検証済みドメインが一致
- [ ] Supabase `Rate limit for sending emails` を 30 通/時間から必要値に引き上げ済み
- [ ] Email Templates は `{{ .TokenHash }}` + `/auth/confirm` 方式のまま（前節）変更していない
- [ ] 実メールアドレス宛の signup / reset-password で到達確認済み

> 参考（いずれも公式）:
>
> - [Supabase: Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
> - [Supabase: Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
> - [Supabase × Resend Integration](https://supabase.com/partners/integrations/resend)
> - [Resend × Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp)
> - [Resend: Send with SMTP](https://resend.com/docs/send-with-smtp)
> - [Resend: Domains](https://resend.com/docs/dashboard/domains/introduction)
> - [Resend: DMARC](https://resend.com/docs/dashboard/domains/dmarc)

---

### Supabase Auth: パスワードポリシー（必須）

Issue #006 で実装した Zod スキーマ（`src/lib/password-schema.ts`）は 8 文字以上 + 英大小・数字を要求する。**Supabase Dashboard 側でも同等以上のポリシーを有効化** し、アプリ層と Auth 層の二重防御を確立する。

#### 1. Authentication → Policies → Password Requirements

Supabase Dashboard の **Authentication → Policies** 画面:

- **Minimum password length**: `8`
- **Password strength**: `Lowercase, uppercase, digits, and symbols`（ASVS L2 相当）を推奨
  - より厳しくする場合は `Lowercase, uppercase, digits, and symbols` を選択
  - 利用者ターゲットが広い場合は `Lowercase, uppercase, and digits` で可
- 変更後、**Save** を押して反映

> 公式ドキュメント: [Password Security](https://supabase.com/docs/guides/auth/password-security)
> 引用: "Anything less than 8 characters is not recommended."

#### 2. Authentication → Attack Protection → Leaked Password Protection（Pro Plan 以上）

- **Enable leaked password protection** を **ON** にする
- これで Supabase 側で HaveIBeenPwned (HIBP) API 連携による漏洩パスワード拒否が有効化される
- 漏洩リストに載っているパスワードはサインアップ / パスワード変更時にサーバー側で即時拒否される

#### 3. Free プランの場合: アプリ層で HIBP チェック

Supabase Free プランでは Dashboard の Leaked Password Protection が使えないため、アプリ層の `src/lib/pwned-password.ts` （HIBP k-Anonymity API）で代替する。

**有効化方法**:

```bash
# ローカル: .dev.vars に追記
echo 'ENABLE_HIBP_CHECK=true' >> .dev.vars

# 本番: Cloudflare Workers の Secret（または vars）として設定
wrangler secret put ENABLE_HIBP_CHECK
# 値に `true` を入力
```

**動作仕様**:

- `auth.signUp` / `admin.createUser` で `ENABLE_HIBP_CHECK=true` のときのみ HIBP API を呼び出す
- SHA-1 ハッシュの先頭 5 文字だけを送信する k-Anonymity モデル（平文・完全ハッシュは外部に送られない）
- **API 障害時はフェイルオープン**（登録をブロックしない）。可用性を優先し、Supabase 側の二重防御に委ねる設計
- Cloudflare Workers の `global_fetch_strictly_public` flag 下でも `api.pwnedpasswords.com` は公開エンドポイントのため動作する

> 公式ドキュメント:
>
> - [HIBP Pwned Passwords API (k-Anonymity)](https://haveibeenpwned.com/API/v3#PwnedPasswords)
> - [NIST SP 800-63B §5.1.1](https://pages.nist.gov/800-63-3/sp800-63b.html#memsecretver)

#### 4. 動作確認

デプロイ後、以下を手動確認:

- [ ] 7 文字以下のパスワードでサインアップ → サーバー側（Zod）で拒否される
- [ ] 英大文字を含まないパスワード → Zod で拒否される
- [ ] `password123` など既知漏洩パスワード → Supabase Pro の Leaked Password Protection、または `ENABLE_HIBP_CHECK=true` で拒否される
- [ ] 強いパスワード（例: `SecurePass2026`）→ 正常登録できる

---

{{SECURITY_SETTINGS}}

---

## ロールバック

{{ROLLBACK_INSTRUCTIONS}}

---

## モニタリング

{{MONITORING_SETUP}}

---

## 本番環境チェックリスト

{{PRODUCTION_CHECKLIST}}

---

## バックアップ

{{BACKUP_STRATEGY}}

---

## サポート

{{DEPLOY_SUPPORT}}
