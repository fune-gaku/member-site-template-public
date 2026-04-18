# セキュリティガイドライン

## 概要

このドキュメントでは、画家作品管理システム開発時のセキュリティ方針とチェックリストを定義します。

**重要**: **コミット前に必ずセキュリティチェックリストを確認**してください。

---

## セキュリティチェックリスト

### ✅ 認証・認可

- [ ] 環境変数（API Key、Secret）がハードコードされていない
- [ ] `.env`ファイルが`.gitignore`に含まれている
- [ ] `.env.example`には実際の値が含まれていない
- [ ] 認証ミドルウェアが全保護ページに適用されている
- [ ] Supabase RLSが適切に設定されている（本番環境）
- [ ] セッショントークン（Cookie）が適切に管理されている
- [ ] ログアウト処理でトークンが削除されている

### ✅ インジェクション対策

- [ ] SQLクエリでユーザー入力を直接連結していない（Supabaseクライアント使用）
- [ ] XSS対策：ユーザー入力をエスケープしている（Vue自動エスケープ）
- [ ] コマンドインジェクション対策：シェルコマンドにユーザー入力を使用していない
- [ ] HTMLインジェクション対策：`v-html`を使用していない（または使用時はサニタイズ）

### ✅ データ検証

- [ ] フォーム入力のバリデーション（フロントエンド・バックエンド両方）
- [ ] ファイルアップロード：拡張子・MIMEタイプ・サイズ制限
- [ ] 画像アップロード：30MB制限が実装されている
- [ ] 数値入力：型チェック・範囲チェック
- [ ] 日付入力：フォーマットチェック
- [ ] 必須項目チェック

### ✅ 情報漏洩対策

- [ ] エラーメッセージで内部情報（DBスキーマ、スタックトレース）を表示していない
- [ ] デバッグログに機密情報（パスワード、トークン）を出力していない
- [ ] APIレスポンスに不要なデータが含まれていない
- [ ] コンソールログに本番で不要な情報を出力していない
- [ ] コメントに機密情報が含まれていない

### ✅ アクセス制御

- [ ] 他ユーザーのデータにアクセスできない（URL直打ち対策）
- [ ] 管理者のみアクセス可能な機能が保護されている
- [ ] ファイルストレージのアクセス制御が適切（Supabase Storage RLS）
- [ ] APIエンドポイントが認証を要求している

### ✅ その他

- [ ] 依存パッケージに既知の脆弱性がない（`npm audit`）
- [ ] CORS設定が適切（本番環境）
- [ ] CSP（Content Security Policy）設定（本番環境）
- [ ] HTTPS強制（本番環境）
- [ ] セキュアなCookie設定（`Secure`, `HttpOnly`, `SameSite`）

---

## 脅威モデル

### 想定する脅威

| 脅威 | リスクレベル | 対策 |
|------|------------|------|
| 環境変数の漏洩 | 高 | `.gitignore`、コードレビュー |
| XSS攻撃 | 中 | Vue自動エスケープ、`v-html`禁止 |
| SQLインジェクション | 中 | Supabaseクライアント使用 |
| 不正ファイルアップロード | 中 | 拡張子・MIME・サイズ制限 |
| セッションハイジャック | 中 | Secure Cookie、HTTPS |
| CSRF攻撃 | 低 | SameSite Cookie（将来的に対応） |

**注意**: 本システムは2名のみ使用（画家本人とMichio）のため、外部からの攻撃リスクは低いが、基本的なセキュリティ対策は必須。

---

## コーディングルール（セキュリティ）

### 環境変数の扱い

**❌ 悪い例**:
```typescript
const supabaseUrl = 'https://xxx.supabase.co';  // ハードコード
const apiKey = 'eyJ...';  // ハードコード
```

**✅ 良い例**:
```typescript
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const apiKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !apiKey) {
  throw new Error('環境変数が設定されていません');
}
```

---

### ユーザー入力のエスケープ

**❌ 悪い例**:
```vue
<div v-html="userInput"></div>  <!-- XSSリスク -->
```

**✅ 良い例**:
```vue
<div>{{ userInput }}</div>  <!-- Vue自動エスケープ -->
```

---

### SQLクエリ

**❌ 悪い例**:
```typescript
// 生SQLで直接入力を連結（Supabaseでは不可能だが、念のため）
const query = `SELECT * FROM artworks WHERE title = '${userInput}'`;
```

**✅ 良い例**:
```typescript
// Supabaseクライアントを使用
const { data } = await supabase
  .from('artworks')
  .select('*')
  .ilike('title', `%${userInput}%`);  // パラメータ化クエリ
```

---

### ファイルアップロード

**✅ 実装例**:
```typescript
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

function validateFile(file: File): boolean {
  // 拡張子チェック
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('許可されていないファイル形式です');
  }

  // サイズチェック
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('ファイルサイズが30MBを超えています');
  }

  // MIMEタイプチェック
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルのみアップロード可能です');
  }

  return true;
}
```

---

### エラーハンドリング

**❌ 悪い例**:
```typescript
try {
  await supabase.from('artworks').insert(data);
} catch (error) {
  alert(error.message);  // 内部エラーがユーザーに表示される
}
```

**✅ 良い例**:
```typescript
try {
  await supabase.from('artworks').insert(data);
} catch (error) {
  console.error('作品登録エラー:', error);  // ログに記録
  alert('作品の登録に失敗しました。もう一度お試しください。');  // ユーザーフレンドリーなメッセージ
}
```

---

## Supabase セキュリティ設定

### Row Level Security（RLS）

**Phase 0-5（開発）**: RLS無効（開発効率優先）

**Phase 6（本番）**: RLS有効化

```sql
-- 管理者のみアクセス可能
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "管理者のみアクセス可能" ON artworks
  FOR ALL
  USING (auth.role() = 'authenticated');
```

### Storage セキュリティポリシー

```sql
-- artwork_photos バケット
CREATE POLICY "管理者のみアップロード可能" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'artwork_photos' AND auth.role() = 'authenticated');

CREATE POLICY "管理者のみ閲覧可能" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'artwork_photos' AND auth.role() = 'authenticated');
```

---

## npm audit

定期的に脆弱性チェックを実行：

```bash
npm audit

# 自動修正
npm audit fix

# 重大な脆弱性のみ表示
npm audit --audit-level=high
```

---

## HTTPS・Cookie設定（本番環境）

### Cloudflare Pages設定

Cloudflare Pagesは自動的にHTTPSを強制。

### Cookie設定

```typescript
// 本番環境ではSecure, SameSite属性を設定
const cookieOptions = {
  path: '/',
  maxAge: 3600,
  secure: import.meta.env.PROD,  // 本番のみSecure
  httpOnly: true,
  sameSite: 'lax' as const
};

document.cookie = `sb-access-token=${token}; ${cookieOptions}`;
```

---

## コミット前チェックフロー

```
1. コード実装完了
   ↓
2. セキュリティチェックリスト確認
   ↓
3. npm audit 実行
   ↓
4. .envがコミット対象に含まれていないか確認
   ↓
5. git diff で機密情報がないか確認
   ↓
6. コミット
```

---

## インシデント対応

### 環境変数が漏洩した場合

1. **即座にSupabaseでAPIキーをローテーション**
2. Gitコミット履歴から削除（`git filter-branch`）
3. `.env`が`.gitignore`に含まれているか再確認

### 脆弱性が発見された場合

1. `npm audit`で詳細確認
2. `npm audit fix`で自動修正
3. 修正不可の場合は該当パッケージを削除または代替パッケージに変更

---

## 参考資料

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [Vue.js Security Best Practices](https://vuejs.org/guide/best-practices/security.html)
