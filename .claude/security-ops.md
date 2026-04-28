# セキュリティ運用ハンドブック

## 概要

このドキュメントは [security.md](./security.md) から分離した **運用ハンドブック**。日常コミット時には不要だが、関連作業（Supabase Dashboard 設定 / 本番デプロイ後の検証 / CSRF テスト / ファイルアップロード機能の追加 / インシデント対応 等）に着手するときに開いて参照する。

`@import` 対象から外し、Claude Code 起動時の常時コンテキストには展開しない方針。実装済みのセキュリティ項目スナップショット・新規実装時のセルフチェック・脅威モデル・コミット前チェックフロー・セキュリティレビュー手順 は引き続き [security.md](./security.md) 側に常駐する。

---

## インシデント対応

### 環境変数が漏洩した場合

1. **即座にSupabaseでAPIキーをローテーション**
   - Supabase Dashboard > Settings > API > Reset Keys
2. **Cloudflare Workers の Secret を更新**
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name member-site-template`
3. Gitコミット履歴から削除（[git-filter-repo](https://github.com/newren/git-filter-repo) を使用）
4. `.env` / `.dev.vars` が `.gitignore` に含まれているか再確認

### 脆弱性が発見された場合

1. `npm audit` で詳細確認
2. `npm audit fix` で自動修正、不可なら `package.json` の `overrides` で固定するか代替パッケージへ
3. 重大な脆弱性は本番運用への影響範囲を見極め、ブロック対応 / Issue 化を即決する

---

## Supabase Dashboard セキュリティ設定チェックリスト

マイグレーション SQL に現れないが、**新規 Supabase プロジェクト構築時に Dashboard で必ず設定する項目**。Supabase 公式 [Going into Prod](https://supabase.com/docs/guides/deployment/going-into-prod) と [Password Security](https://supabase.com/docs/guides/auth/password-security) に基づく。

### Auth 設定（Authentication > Providers > Email / Settings）

| 項目                    | 推奨値                     | 理由                                                              |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| Email confirmation      | **ON**                     | メール到達性を保証、なりすまし登録防止                            |
| OTP 有効期限            | **≤ 3600 秒（1 時間）**    | Supabase 公式推奨上限。超えると Security Advisor が警告           |
| Minimum password length | **8 文字**                 | `src/lib/password-schema.ts` の Zod `passwordSchema` と一致させる |
| Password requirements   | **数字 + 小文字 + 大文字** | アプリ側 Zod と一致させる（Zod で先に弾き、Dashboard で二重防御） |
| Confirm email change    | **ON**                     | メール変更時の乗っ取り防止                                        |
| Secure email change     | **ON**                     | 旧メール側での承認を要求                                          |

### Sessions 設定（Authentication > Sessions）

本テンプレートの方針は [セッション寿命方針（Remember Me 非採用）](#セッション寿命方針remember-me-非採用) 参照。プロジェクトの要件に応じて以下を設定:

| 項目                    | 汎用会員サイト | 管理画面・金融系 |
| ----------------------- | -------------- | ---------------- |
| Time-box user sessions  | 30 日          | 24 時間以内      |
| Inactivity timeout      | 適度な値       | 短め             |
| Single session per user | OFF            | **ON**           |

### 組織・プロジェクト側（Account > Security / Organization）

| 項目                        | 推奨         | 備考                                     |
| --------------------------- | ------------ | ---------------------------------------- |
| Supabase アカウントの MFA   | **有効**     | 乗っ取られるとプロジェクトごと支配される |
| Organization の複数 owner   | **2 名以上** | Bus factor 対策                          |
| GitHub 連携アカウントの 2FA | **有効**     | 同上                                     |

### Pro プラン以上で追加で有効化する項目

無料プランでは使えないが、課金後に必ず有効化するもの:

| 項目                               | プラン                   | 用途                                                                                 |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Leaked password protection（HIBP） | **Pro 以上**             | 流出済みパスワードを拒否。無料プランではアプリ層の `ENABLE_HIBP_CHECK=true` で代替中 |
| Point in Time Recovery (PITR)      | **Pro 以上（アドオン）** | DB 障害時の任意時点復元                                                              |
| Network restrictions               | **Pro 以上**             | DB 接続元 IP 制限                                                                    |

---

## Supabase Advisor で残る想定済み警告と対応

Supabase Dashboard > Database > Advisors > Security に出る警告のうち、**本テンプレートで対応方針が確定しているもの** をここに集約する。テンプレ利用者が初めて Advisor を開いて警告を見たときに「真正なバグ」と勘違いしないための索引。

### Leaked Password Protection Disabled

> Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.

| プラン   | 対応                                                                                                                                                                                                            | 結果                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Free** | アプリ層 `ENABLE_HIBP_CHECK=true` で代替する（[`src/lib/pwned-password.ts`](../src/lib/pwned-password.ts) が HIBP k-Anonymity API へ照会）                                                                      | Advisor の警告は **出続ける**（プランの仕様）     |
| **Pro 以上** | Dashboard > Authentication > Attack Protection > **Enable leaked password protection** を ON。アプリ層 `ENABLE_HIBP_CHECK` は **OFF（unset または `false`）** にして二重実行を避ける             | Advisor の警告が消える                            |

#### Free → Pro へ移行したときのスイッチング手順

二重実行（Dashboard ON + アプリ層 ON）は Supabase 側で reject されたあとにアプリ層が再度 HIBP API を呼ぶ余計なレイテンシを生むため、必ず片方に揃える。

1. Supabase Dashboard > Authentication > Attack Protection > **Enable leaked password protection** を **ON**
2. Cloudflare Workers の Secret から `ENABLE_HIBP_CHECK` を **削除** (または `false`)
   ```bash
   npx wrangler secret delete ENABLE_HIBP_CHECK
   ```
3. ローカル `.dev.vars` でも `ENABLE_HIBP_CHECK` 行を削除 / コメントアウト
4. 動作確認: 既知漏洩パスワード（例 `password123`）でサインアップ → Supabase 側で reject されることを確認
5. Advisor を Run しなおし、`Leaked Password Protection Disabled` 警告が消えていることを確認

#### 設計判断

- **アプリ層フォールバック方式**: Free プランで Dashboard 機能を使えない代わりに、アプリ層で HIBP k-Anonymity API（SHA-1 prefix のみ送信）を呼ぶ。SHA-1 完全ハッシュ・平文は外部に送られない
- **API 障害時はフェイルオープン**: 可用性を優先し、HIBP API 不通時は登録をブロックしない。Supabase 側のパスワードポリシー（最小長 + 文字種）が二重防御として残る
- **`ENABLE_HIBP_CHECK` のデフォルト**: テンプレ初期値は **未設定（OFF 相当）**。利用者がプランに応じて opt-in する方針。`.dev.vars.example` にコメントアウト形で記載

> 公式ドキュメント:
>
> - [Password Security | Supabase Docs](https://supabase.com/docs/guides/auth/password-security)
> - [Have I Been Pwned: Pwned Passwords API (k-Anonymity)](https://haveibeenpwned.com/API/v3#PwnedPasswords)

### 他に Advisor で出る警告

このテンプレートでは Issue #27（`handle_new_user()` の REST 公開遮断）対応で `lint 0028 / 0029` を解消済み。それ以外で **「想定外」** の警告が新たに出た場合は、本ドキュメントに追記するか、対応 Issue を切ること。

---

## セキュリティヘッダの動作確認

`src/middleware.ts` が全レスポンスに共通セキュリティヘッダ（CSP / HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / Cross-Origin-Opener-Policy）を付与している。定義は `src/lib/security-headers.ts` 参照。

### ローカル環境での確認

```bash
# Astro 開発サーバーを起動
npm run dev

# 別ターミナルで付与されているか確認
curl -sI http://localhost:4321/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

期待される出力例:

```
content-security-policy: default-src 'self'; base-uri 'self'; frame-ancestors 'none'; ...
cross-origin-opener-policy: same-origin
permissions-policy: accelerometer=(), camera=(), ...
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-content-type-options: nosniff
x-frame-options: DENY
```

### 本番環境（Cloudflare Workers）での確認

```bash
curl -sI https://member-site-template.your-subdomain.workers.dev/ \
  | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin-opener'
```

### スキャナでの評価

- [Mozilla Observatory](https://observatory.mozilla.org/) で **A 以上**
- [securityheaders.com](https://securityheaders.com/) で **A 以上**

### CSP 違反チェック

ブラウザ DevTools の Console を開き、以下を操作しても CSP error が出ないことを確認:

- サインアップ・サインイン・サインアウト
- プロフィール画面でアバター画像を表示（`https://<ref>.supabase.co/...`）
- 任意のページのハイドレーション

---

## CSRF 対策（サインアウト経路）

### 基本方針

サインアウトのように **状態を変更する操作は必ず POST** とする（[RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1) safe methods）。リンクベース CSRF（`<a href="/auth/signout">` を踏ませる／メーラーのプリフェッチ）による **意図しない強制ログアウト** を防ぐため、以下を徹底する：

1. **Astro Action + `<form method="POST" action={actions.auth.signOut}>` のみを経由** して `supabase.auth.signOut()` を呼ぶ。
2. `/auth/signout` ページは互換のため残すが、**GET には `405 Method Not Allowed`** を返す。
3. `astro.config.mjs` の `security.checkOrigin` を **既定値 `true` のまま維持**。これで Astro がクロスオリジン POST を自動的に 403 で拒否する。
4. ナビゲーションヘッダ（`Member.astro` / `Admin.astro`）やダッシュボードの「サインアウト」ボタンは全て form POST（Action 呼び出し）に統一する。`<a href="/auth/signout">` は作らない。

### CSRF 検証（自動テスト + 本番デプロイ後の最終確認）

**回帰検出は自動テストでカバー済み**（Issue #16）。`/auth/signout` や `auth.signOut` Action、`security.checkOrigin` 周辺を改修した場合は以下のコマンドで両系統を回す:

```bash
npm run test           # GET 405 ガード（tests/integration/signout-csrf.test.ts）
npm run test:workers   # クロスオリジン POST 403（tests/workers/csrf.test.ts、実 workerd ランタイム）
```

| #   | 観点                                                  | 自動テスト                                                                          | 本番 curl |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 1   | GET / HEAD / その他 safe method → 405 + `Allow: POST` | [tests/integration/signout-csrf.test.ts](../tests/integration/signout-csrf.test.ts) | 下記 1    |
| 2   | クロスオリジン POST → 403（`security.checkOrigin`）   | [tests/workers/csrf.test.ts](../tests/workers/csrf.test.ts)                         | 下記 2    |
| 3   | 同一オリジン POST → 403 でない（CSRF を通過）         | 同上                                                                                | 下記 3    |

**本番デプロイ直後**は、自動テストが通った前提で、デプロイされた実環境が同じ挙動を示すことだけを最終確認する（Cloudflare 側の CDN / WAF / Rate Limiting で挙動が変わっていないかの sanity check）:

```bash
# 1) 攻撃者視点: クロスオリジン GET（リンク踏ませ・メーラー URL プリフェッチを模擬）
curl -i -X GET https://member-site-template.your-subdomain.workers.dev/auth/signout
# 期待: HTTP/2 405 / Allow: POST （Cookie が付いていても sb-* の delete は起きない）

# 2) 攻撃者視点: クロスオリジン POST（Origin ヘッダが別サイト）
curl -i -X POST \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  https://member-site-template.your-subdomain.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 403 （Astro security.checkOrigin が Origin/Referer 不一致で拒否）

# 3) 同一オリジン POST（正規フロー、ダッシュボードのボタン相当）
curl -i -X POST \
  -H "Origin: https://member-site-template.your-subdomain.workers.dev" \
  -H "Referer: https://member-site-template.your-subdomain.workers.dev/member/dashboard" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --cookie "sb-...=..." \
  https://member-site-template.your-subdomain.workers.dev/_actions/auth.signOut
# 期待: HTTP/2 200 / Set-Cookie: sb-...=; Max-Age=0 （セッション Cookie 削除）
```

### 受け入れ基準

- [x] GET / HEAD / その他 safe method の `/auth/signout` が **405 Method Not Allowed** + `Allow: POST` を返す（自動: `tests/integration/signout-csrf.test.ts`）
- [x] クロスオリジン POST が **403** で拒否される（自動: `tests/workers/csrf.test.ts`、`security.checkOrigin` の動作）
- [x] 同一オリジン POST は **403 にならない**（CSRF を通過する。自動: `tests/workers/csrf.test.ts`）
- [x] スパムメールの URL スキャナーが GET しても Cookie 削除が走らない（本番デプロイ直後に curl で確認）
- [x] ダッシュボード・ナビゲーションヘッダのサインアウトがクリック 1 回で従来どおり動作する

---

## ファイルアップロードのガイドライン

`avatars` バケットのようなユーザーアップロードは多層防御を徹底する。重要度の高い順:

1. **バケット設定（Supabase Storage）が真の防衛線** — `storage.buckets.allowed_mime_types` と `file_size_limit` を初期マイグレーション (`supabase/migrations/20260420205000_init.sql`) で必ず設定。Supabase 公式: _"Upload restrictions ... are defined at the bucket level"_
2. **サーバ側（Astro Action の Zod）で早期検証** — `.refine()` で MIME / サイズを 400 応答で弾く。`upload()` 呼び出し時は `contentType: input.file.type` を明示し、クライアント送出を盲信しない
3. **クライアント側検証は UX 目的のみ** — `<input accept="...">` と `file.type` は DevTools で迂回可能、単独でセキュリティ対策にしない

### 許可する MIME タイプ

`image/png` / `image/jpeg` / `image/webp` / `image/gif` のみ。**`image/svg+xml` は意図的に除外** — SVG は XML + JavaScript 実行コンテナのため、署名付き URL で開かれると `<ref>.supabase.co` 上で Stored XSS が成立し得る（[MDN: SVG restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/SVG_as_an_Image#restrictions)）。SVG が必要な場合は `Content-Disposition: attachment` 固定の別バケットを検討する。

### ファイルサイズ

上限 **5 MB**。`src/lib/avatar-upload.ts` の `MAX_AVATAR_SIZE` を真実の源として、バケット設定・Action・UI で共有する。

### ファイル名サニタイゼーション

`src/lib/avatar-upload.ts` の `sanitizeAvatarFileName()` を使う:

- 日本語・絵文字・多言語 Unicode は保持（UX）
- `/` `\` `:` `*` `?` `"` `<` `>` `|` と制御文字のみ `_` に置換（OS 互換 / パストラバーサル）
- `..` は `_` に畳み込む（パストラバーサル対策）
- 先頭末尾の空白・ドットはトリム（Windows の trailing-dot 解釈事故回避）

### 運用: 既存オブジェクトの棚卸し

バケット制限を後から追加した場合、過去にアップロードされたファイルはそのまま残る。違反オブジェクトを洗い出すクエリ:

```sql
select id, name, owner, metadata->>'mimetype' as mime, metadata->>'size' as size
  from storage.objects
 where bucket_id = 'avatars'
   and (
     (metadata->>'size')::bigint > 5 * 1024 * 1024
     or coalesce(metadata->>'mimetype', '') not in (
       'image/png','image/jpeg','image/webp','image/gif'
     )
   );
```

---

## セッション寿命方針（Remember Me 非採用）

本テンプレートは「ログイン状態を保持」（Remember Me）チェックボックスを採用しない。Supabase Auth はセッション寿命を **per-login で切り替える API を提供しておらず**、すべて **プロジェクト単位の設定**（Dashboard > Auth > Sessions）に一元化される設計のため、UI 上で選択肢を出すと挙動を分岐できず誤解を招く（Issue #009 で削除済）。

寿命の制御軸（プロジェクト設定）:

| 設定項目                | 用途                                                       |
| ----------------------- | ---------------------------------------------------------- |
| Time-box user sessions  | サインインから固定時間でセッションを強制失効               |
| Inactivity timeout      | 一定時間リフレッシュされなかったセッションを失効           |
| Single session per user | 同一ユーザーは最後にサインインしたセッションのみ有効に保つ |

プロジェクト用途別の推奨値は [Supabase Dashboard セキュリティ設定チェックリスト](#supabase-dashboard-セキュリティ設定チェックリスト) の Sessions 表を参照。詳細・最新の挙動は [Supabase Sessions 公式ドキュメント](https://supabase.com/docs/guides/auth/sessions)。

実装上の注意:

- セッションリフレッシュは `@supabase/ssr` の `createServerClient` と `middleware.ts` の `supabase.auth.getUser()` が自動で行う（[認証フロー](./architecture.md#認証フロー)）
- セッションを明示的に終了させたい場合は **サインアウト**（`supabase.auth.signOut()`）
- Dashboard 設定の変更は **次回リフレッシュ時に評価される**（即時反映ではない）
