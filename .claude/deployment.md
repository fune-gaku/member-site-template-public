# デプロイ手順

## デプロイ先

**Cloudflare Workers**（エッジランタイム + Workers Static Assets による静的アセット配信を併用）。`@astrojs/cloudflare` v13 アダプターで SSR ハンドラを `@astrojs/cloudflare/entrypoints/server` にビルドし、Wrangler がエントリーポイントとして実行する。

---

## 事前準備

[README.md「前提条件」](../README.md#前提条件) を参照（Node.js >= 22.12.0 / Supabase / Cloudflare アカウント / `npx wrangler` ）。

---

## 環境変数設定

[README.md「環境変数」](../README.md#環境変数) を参照。`.env`（公開値）と `.dev.vars`（ローカルの秘密値）の使い分け、本番 Secret の `wrangler secret put` 登録手順は同節に集約されている。

---

## ビルド設定

[README.md「デプロイ設定の要点」](../README.md#デプロイ設定の要点) を参照。`wrangler.jsonc` の `main` / `assets` / `compatibility_flags` / `observability` の意図はそこにまとめてある。

---

## デプロイ手順

[README.md「Cloudflare Workers へのデプロイ」](../README.md#cloudflare-workers-へのデプロイ) の 10 ステップを正とする。要点のみ:

- 初回: `npx wrangler login` → `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template`
- 通常: `npm run deploy`（= `wrangler types && astro build && wrangler deploy`）
- 確認: `npx wrangler secret list --name member-site-template` で per-Worker Secret に登録されていること（Secrets Store 側ではない）

> GitHub 連携の自動デプロイ（Workers Builds）は本テンプレートでは採用していない。Secret 管理の混乱を避けるため CLI 経由を推奨する（理由は README 同節の注意書き参照）。

---

## デプロイ確認

[README.md「10. 動作確認と以降の更新」](../README.md#cloudflare-workers-へのデプロイ) を参照。Cloudflare Dashboard > Workers & Pages > 該当 Worker > **Logs** で起動ログ確認、デプロイ後は [security.md「セキュリティヘッダの動作確認」](./security.md#セキュリティヘッダの動作確認) のヘッダ検証コマンドを必ず流す。

---

## カスタムドメイン設定（オプション）

1. Cloudflare Dashboard > Workers & Pages > 該当 Worker > **Settings → Domains & Routes → Add → Custom Domain**
2. ルート対象ドメイン（例: `members.example.com`）を入力。Cloudflare 管理下のゾーンであれば DNS レコードは自動作成される
3. SSL/TLS は Cloudflare 側で自動発行（Universal SSL）。完全な HTTPS で配信されるまで数分待つ
4. デプロイ後、Supabase Dashboard > **Authentication → URL Configuration** の `Site URL` と `Redirect URLs` を新ドメインに更新する（メール内リンクの遷移先が変わるため）
5. Supabase メールテンプレート（[deployment.md「Supabase Auth: Email Templates」](#supabase-auth-email-templates必須--issue-002--002-b)）の `{{ .SiteURL }}` は自動でこの値を使うので変更不要

---

## トラブルシューティング

[README.md「トラブルシューティング」](../README.md#トラブルシューティング) を参照。特に「Secret が登録したはずなのに undefined になる」（per-Worker Secret と Secrets Store の混同）は本テンプレ固有のハマりどころなので必読。

---

## パフォーマンス最適化

[architecture.md「パフォーマンス方針」](./architecture.md#パフォーマンス方針) を参照（Astro Islands の最小 JS 配信、`<Image>` の画像最適化、Tailwind の Purge、Cloudflare Edge 配信）。

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

### Supabase Auth: JWT 寿命とセッション設定（必須）

本テンプレートはサーバ側で `auth.getClaims()` (= `getAuthUser()`) を使って JWT を検証する。Supabase が **asymmetric signing keys** モードのとき検証は WebCrypto によるローカル処理になり、Auth サーバとの往復が消える代わりに、別端末からの sign-out / アカウント停止 / 強制ログアウトが **JWT 寿命まで反映されない**。

公式 [Sessions docs](https://supabase.com/docs/guides/auth/sessions) は以下を明記:

> "the validity of the JWT remains until it expires"
>
> "Most applications rarely need such strong guarantees. **Consider adjusting the JWT expiry time** to an acceptable value."

本テンプレはこの公式方針に従い、コード側に強制サーバ検証を入れず **JWT 寿命を Dashboard で短く設定** することで失効ラグを許容範囲に収める。完全な strong validation pattern (= `auth.sessions` テーブルへの session_id 直接 query) は Issue #23 で追跡。

#### 推奨設定 (Authentication → Sessions)

| 項目                        | 推奨値 (汎用会員サイト) | 推奨値 (admin 重視・金融系) |
| --------------------------- | ----------------------- | --------------------------- |
| **JWT expiry limit**        | 1800 秒 (30 分)         | 300〜900 秒 (5〜15 分)      |
| **Inactivity timeout**      | 適度な値（例: 7 日）    | 短め（例: 1 日）            |
| **Time-box user sessions**  | 30 日                   | 24 時間以内                 |
| **Single session per user** | OFF                     | ON                          |

JWT expiry を短く設定するほど失効ラグが縮まるが、refresh トークンによる再発行頻度が上がりブラウザ側の負荷が増える。**5 分以下は実用上ほぼ意味がなく** (refresh トークンの round-trip コストの方が大きくなる)、**30 分が汎用デフォルト** として落としどころ。

> **トレードオフの指針** (公式 docs より):
>
> - 利用シナリオごとに「失効反映の速さ」と「再発行頻度」のバランスを取る
> - admin role を多数抱える / 金融系 / 規制業界では短めに (5〜15 分)
> - 一般会員サイトは 30 分〜1 時間で十分

#### 設定変更後の動作確認

```bash
# 1. Supabase Dashboard で JWT expiry を変更
# 2. ブラウザでサインイン → DevTools > Application > Cookies で sb-* の Expires を確認
# 3. 設定値と一致していること
# 4. 寿命経過後にリクエストを送り、自動で refresh が走ることを確認
```

---

## 任意機能（opt-in）

「使うときだけ追加で必要になる」opt-in 機能のセットアップ手順は [.claude/deployment-optional.md](./deployment-optional.md) に集約してある。該当機能を使わない場合は本ファイルの手順だけで本番デプロイまで完結する（`cp .env.example .env && npm install && npm run dev` から本番デプロイまで `deployment.md` だけ読めばよい）。

| 機能                                                                                | 用途                                                           | デフォルト |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- |
| [Cloudflare Turnstile](./deployment-optional.md#cloudflare-turnstile任意--bot-対策) | `auth.signUp` / `signIn` / `resetPassword` の 3 経路に CAPTCHA | OFF        |
| [Google OAuth](./deployment-optional.md#google-oauth-セットアップ任意)              | email + password に加えて Google ログインを追加                | OFF        |

将来追加される opt-in 機能（別 IdP / SSO / 外部サービス連携など）も `deployment-optional.md` に集約する方針。

---

## 初期 admin の bootstrap（必須・1 回限り）

新規 Supabase プロジェクトを作って `supabase db push` でマイグレーション適用直後は、`auth.users` も `profiles` も空の状態で **admin ユーザーが 1 人もいない**。`/admin/users` の招待機能 (`admin.inviteUser` Action) は admin としてサインインしている前提なので、最初の 1 人だけは別経路で作る必要がある（chicken-and-egg）。

PR #48 で `profiles.role` への column-level UPDATE 権限を `authenticated` から剥奪したため、**通常のサインアップ経路では決して admin になれない**設計。promotion は **`service_role` 権限を持つ Supabase Dashboard SQL Editor から実行**する。

### 推奨経路

#### Option A: 通常サインアップ → SQL Editor で promotion（**推奨**）

エンドユーザーと同じフローを通るので、Email Templates / Custom SMTP / `/auth/confirm` ランディング等の **deployment 全体の動作も同時に validate** できる。

```
1. 本番 URL の /auth/signup にアクセス
   例: https://member-site-template.your-subdomain.workers.dev/auth/signup
2. admin 用のメールアドレスでサインアップ
3. 確認メールが届く（Resend 経由）→ メール内のリンクをクリック
   → /auth/confirm 経由で session 確立 → /member/dashboard にリダイレクト
4. Supabase Dashboard > SQL Editor で以下を実行:

   update public.profiles
      set role = 'admin'
    where user_id = (
      select id from auth.users
       where email = 'YOUR_ADMIN_EMAIL@example.com'
    );

5. ブラウザで /admin/users にアクセスして表示されれば成功
   （middleware が profiles.role を毎リクエスト fetch するため、
    JWT を refresh せず即時反映される。サインアウト/再ログイン不要）
```

#### Option B: Dashboard から直接ユーザー作成 → promotion

Resend / SMTP / Email Templates の設定が **未完了** でも進められる。Email 経路の動作確認はスキップされる。

```
1. Supabase Dashboard > Authentication > Users > "Add user" > "Create new user"
   - Email: admin@your-domain.com
   - Password: 強力なパスワード（8 文字以上 + 数字 + 大文字 + 小文字）
   - Auto Confirm User: ON  ← 重要、メール確認をスキップ
2. handle_new_user トリガーが発火し、profiles 行が自動生成される（role='member'）
3. SQL Editor で Option A の step 4 と同じ promotion クエリを実行
4. 本番 URL の /auth/signin で作成したメアド + パスワードでログイン
5. /admin/users にアクセスできれば成功
```

### Option A vs B の選択

| 観点                                                 | Option A                | Option B                               |
| ---------------------------------------------------- | ----------------------- | -------------------------------------- |
| Resend / SMTP の動作確認も兼ねる                     | ✅                      | ❌                                     |
| Email Templates（`{{ .TokenHash }}` 経路）の動作確認 | ✅                      | ❌                                     |
| `/auth/confirm` ランディングの動作確認               | ✅                      | ❌                                     |
| 失敗時の切り分けやすさ                               | △（失敗ポイントが多い） | ✅（DB レイヤー直 + ログイン経路だけ） |
| 速さ                                                 | △（メール往復が必要）   | ✅                                     |

**推奨**: 最初は **Option A** で full path を検証 → 失敗するレイヤーがあれば該当節（[Email Templates](#supabase-auth-email-templates必須--issue-002--002-b) / [SMTP (Resend)](#supabase-auth-smtp-resend-設定本番必須) / [URL Configuration](#supabase-auth-jwt-寿命とセッション設定必須)）を確認。Option A が成功したら、以降の追加 admin / 通常メンバーは `/admin/users` 画面の招待機能（`admin.inviteUser` Action）から運用できる。

### 設計根拠

- **なぜ migration / seed.sql で admin を pre-seed しないか**: メールアドレスやパスワードハッシュを repo に含めることになり、（a）秘密情報が git 履歴に残る、（b）admin 変更時にマイグレーションを再発行する必要がある、（c）downstream fork が template の admin 認証情報をそのまま流用するリスクがある。1 回限りの bootstrap は手動の方が安全。
- **なぜ `service_role` 経由でしか admin promotion できない設計か**: `authenticated` ロールから `profiles.role` の column-level UPDATE 権限を剥奪する設計が PR #48 で確定（[security.md「想定する脅威」](./security.md#想定する脅威) の権限昇格行 / [database.md「権限昇格攻撃の防止」](./database.md#権限昇格攻撃の防止)）。これにより、自分で自分を admin に promote するクライアント経路が存在しないため、最初の 1 人は別 channel が必須。Dashboard SQL Editor は `service_role` 権限で動作するためこの制約を正規にバイパスできる。
- **promotion 後にセッション再確立は不要**: middleware ([src/middleware.ts:60-76](../src/middleware.ts#L60-L76)) は `/member/*` `/admin/*` への各リクエストで `profiles.role` を fetch する設計。JWT に role を埋め込んでいないため、UPDATE 直後の次のページ遷移で `/admin/*` 配下が解放される。

### チェックリスト

- [ ] 新規 Supabase プロジェクトに `supabase db push` で migration 適用済み
- [ ] `/admin/users` にアクセスすると `/member/dashboard` にリダイレクトされることを事前確認（= まだ admin 不在）
- [ ] Option A または B で 1 人目の admin を作成
- [ ] SQL Editor で promotion 実行
- [ ] `/admin/users` にアクセスして表示されることを確認
- [ ] 念のため `select role from public.profiles where user_id = ...` で `'admin'` が入っていることを SQL で再確認

---

## ロールバック

Cloudflare Workers は過去のデプロイ履歴をリトルバックエンドとして保持しているため、即時ロールバックが可能。

```bash
# 過去のデプロイ一覧（直近 10 件）
npx wrangler deployments list --name member-site-template

# 直前の安定版に即時ロールバック（version-id は上記出力から取得）
npx wrangler rollback --name member-site-template <version-id>
```

データベース（Supabase）側のロールバックはアプリ側の rollback とは独立している点に注意:

- スキーマ変更を含むデプロイで問題が出た場合は、まずアプリを Workers でロールバックしつつ、Supabase 側は **Pro プラン以上のみ Point in Time Recovery (PITR)** が利用可能
- 無料プランの場合は手動の `pg_dump` バックアップに依存する（→ [バックアップ](#バックアップ) 参照）
- マイグレーションは [database.md「マイグレーション運用」](./database.md#マイグレーション運用) に従って **本番適用前にローカル再現確認** を必ず行うこと

---

## モニタリング

| 対象                           | 確認場所                                                                                                      | 何を見るか                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker 起動・リクエスト        | Cloudflare Dashboard > Workers & Pages > 該当 Worker > **Logs**                                               | `wrangler.jsonc` の `observability.enabled: true` で有効化済。リクエストごとの `console.error` / 例外を即時確認                                                                                   |
| Worker メトリクス              | 同 Worker > **Metrics**                                                                                       | リクエスト数 / CPU 時間 / エラーレート / サブリクエスト数                                                                                                                                         |
| Supabase Auth ログ             | Supabase Dashboard > **Logs → Auth Logs**                                                                     | サインアップ／サインインの失敗、SMTP 4xx/5xx、OTP 失効                                                                                                                                            |
| Supabase DB ログ               | Supabase Dashboard > **Logs → Postgres Logs**                                                                 | クエリエラー、RLS 違反                                                                                                                                                                            |
| Security / Performance Advisor | Supabase Dashboard > **Database → Advisors**                                                                  | RLS 未有効テーブル / インデックス不足等。マイグレーション適用直後に必ず実行（[security.md「手動で定期実施する項目」](./security.md#手動で定期実施する項目) 参照） |
| 依存パッケージ脆弱性           | GitHub > Security > Dependabot                                                                                | `npm audit --audit-level=high` の CI と Dependabot が週次で監視                                                                                                                                   |
| セキュリティヘッダ             | [Mozilla Observatory](https://observatory.mozilla.org/) / [securityheaders.com](https://securityheaders.com/) | 四半期に 1 回 A 以上を維持                                                                                                                                                                        |

---

## 本番環境チェックリスト

`main` マージ → 本番デプロイの直前に以下を確認する。

### コード・テスト

- [ ] `npm run typecheck` が成功
- [ ] `npm run lint` が成功
- [ ] `npm run format:check` が成功
- [ ] `npm run test` が全グリーン
- [ ] `npm audit --audit-level=high` でヒットなし

### Supabase（Dashboard 設定）

- [ ] [security.md「Supabase Dashboard セキュリティ設定チェックリスト」](./security.md#supabase-dashboard-セキュリティ設定チェックリスト) が完了
- [ ] [Email Templates](#supabase-auth-email-templates必須--issue-002--002-b) を `{{ .TokenHash }}` + `/auth/confirm` 方式に切替済
- [ ] [Custom SMTP（Resend）](#supabase-auth-smtp-resend-設定本番必須) を有効化、Sender ドメインが `verified` で SPF / DKIM / DMARC 通過
- [ ] [パスワードポリシー](#supabase-auth-パスワードポリシー必須) を Dashboard 側でも 8 文字以上＋複雑性で設定
- [ ] [JWT 寿命とセッション設定](#supabase-auth-jwt-寿命とセッション設定必須) を確認（汎用 30 分 / admin 重視 5〜15 分）
- [ ] マイグレーション適用後 **Security Advisor / Performance Advisor を Run** し新規違反なし

### Cloudflare Workers（Dashboard / CLI）

- [ ] `npx wrangler secret list --name member-site-template` で `SUPABASE_SERVICE_ROLE_KEY` が **per-Worker Secret** に登録済（Secrets Store 側ではない）
- [ ] 公開値 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY` が **ビルド時の `.env`（または `.env.production`）** に本番値で入っている。`wrangler.jsonc` の `vars` に書いても効かないので注意（[README「8. 本番公開値の供給」](../README.md#8-本番公開値の供給ビルド時-inline) 参照）
- [ ] `compatibility_flags` に `nodejs_compat` が含まれている
- [ ] Custom Domain を使うなら Supabase 側 `Site URL` / `Redirect URLs` を更新済
- [ ] **Turnstile を有効化する場合のみ**: [Cloudflare Turnstile（任意 / bot 対策）](./deployment-optional.md#cloudflare-turnstile任意--bot-対策) の手順で **Supabase Dashboard > Auth > Bot and Abuse Protection** に Secret Key を登録、`PUBLIC_TURNSTILE_SITE_KEY` を build 環境の `.env` に設定。本番 Workers の secret は不要（Supabase Auth が直接検証する）
- [ ] **Google OAuth を有効化する場合のみ**: [Google OAuth セットアップ（任意）](./deployment-optional.md#google-oauth-セットアップ任意) の手順で Google Cloud Console に OAuth client を作成、**Supabase Dashboard > Authentication > Providers > Google** に Client ID / Secret を登録、`PUBLIC_GOOGLE_AUTH_ENABLED=true` を build 環境の `.env` に設定。本番 Workers の secret は不要（Supabase Auth が直接 Google と通信する）

### デプロイ後の動作確認

- [ ] [security.md「セキュリティヘッダの動作確認」](./security.md#セキュリティヘッダの動作確認) の `curl -sI` を流して全ヘッダ付与を確認
- [ ] [security.md「CSRF 対策（サインアウト経路）」](./security.md#csrf-対策サインアウト経路) の 3 コマンドが期待通り（GET 405 / クロスオリジン POST 403 / 同一オリジン POST 200）
- [ ] サインアップ → 確認メール到達 → 「続行」クリック → `/auth/update-password` 遷移 → サインインの一連が成功
- [ ] [初期 admin の bootstrap](#初期-admin-の-bootstrap必須1-回限り) を完了（新規 Supabase プロジェクトの場合 1 回限り、SQL Editor で promotion）
- [ ] `/admin/users` に admin ロールでアクセス可、member ロールでアクセス不可

---

## バックアップ

| 対象                         | 仕組み                                                                                                   | 頻度       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| Supabase Postgres            | 自動バックアップ（無料: 日次・直近 7 日 / Pro: 日次 + PITR）                                             | プラン依存 |
| Supabase Storage（avatars）  | 自動バックアップは Postgres と同基準。PITR 対象外なので、重要データはアプリ側で別途エクスポート          | 必要に応じ |
| Worker 設定                  | `wrangler.jsonc` を Git で管理。Secret は CLI で再投入（[deployment.md「デプロイ手順」](#デプロイ手順)） | 都度       |
| Cloudflare KV / R2（採用時） | 各サービスの公式バックアップ機構に従う                                                                   | —          |

無料プランから本番運用に移すときは、最低限 **Pro プランの PITR を有効化**（[security.md「Pro プラン以上で追加で有効化する項目」](./security.md#pro-プラン以上で追加で有効化する項目) 参照）。マイグレーション適用前には、Supabase Dashboard > **Database → Backups** から手動スナップショットを取って巻き戻し可能にしておく。
