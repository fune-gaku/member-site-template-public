# Issue #001: 日本語ファイル名のサポート

**作成日**: 2026-04-18
**優先度**: Medium
**ステータス**: Open
**カテゴリ**: Enhancement / Bug

---

## 問題の概要

現在のファイル名サニタイゼーション処理では、セキュリティ対策として英数字以外の文字を `_` に置換しているため、**日本語を含むファイル名が正しく保存されない**問題があります。

### 現在の実装

**[src/actions/index.ts:115](../../src/actions/index.ts#L115)**
```typescript
// ファイル名をサニタイズ（パストラバーサル攻撃対策）
const sanitizedFileName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
```

### 問題の具体例

| 元のファイル名 | サニタイズ後 |
|---------------|-------------|
| `プロフィール画像.jpg` | `__________.jpg` |
| `会社ロゴ-2024.png` | `____-2024.png` |
| `田中 太郎.jpeg` | `______.jpeg` |

---

## 影響範囲

### ユーザー体験への影響

- ✅ **セキュリティ**: パストラバーサル攻撃は防止できている
- ❌ **UX**: 日本語ファイル名が `_` の羅列になり、ファイルの識別が困難
- ❌ **国際化**: 日本語以外の多言語（中国語、韓国語、絵文字など）も使用不可

### 技術的影響

- Storage内のファイルは正常に保存される
- データベースの `avatar_url` には正しいパスが保存される
- ファイルのダウンロード・表示は正常に動作
- **問題**: ファイル名から元の名前が推測できない

---

## 解決策の提案

### オプション1: Unicode対応のサニタイゼーション（推奨）

**実装例**:
```typescript
// Unicode文字を許可し、危険な文字のみ除外
const sanitizedFileName = input.file.name
  .replace(/[\/\\:*?"<>|]/g, "_")  // 危険な文字を置換
  .replace(/\.\./g, "_");           // ".." を置換（パストラバーサル対策）
```

**メリット**:
- ✅ 日本語・多言語ファイル名をサポート
- ✅ パストラバーサル攻撃は防止
- ✅ ユーザー体験が向上

**デメリット**:
- ⚠️ URLエンコードが必要になる可能性（Supabase Storageが自動処理）

---

### オプション2: ファイル名を完全にランダム化

**実装例**:
```typescript
import { randomUUID } from "crypto";

// 拡張子のみ保持し、ファイル名はUUID化
const ext = input.file.name.split(".").pop();
const sanitizedFileName = `${randomUUID()}.${ext}`;
```

**メリット**:
- ✅ セキュリティが最も高い
- ✅ 実装がシンプル
- ✅ ファイル名の競合が発生しない

**デメリット**:
- ❌ 元のファイル名が完全に失われる
- ❌ 管理画面でファイル識別が困難

---

### オプション3: 元のファイル名をメタデータとして保存

**実装例**:
```typescript
// データベーススキーマに original_filename カラムを追加
const sanitizedFileName = `${randomUUID()}.${ext}`;

await supabase
  .from("profiles")
  .update({
    avatar_url: filePath,
    original_filename: input.file.name  // 元のファイル名を保存
  })
  .eq("user_id", user.id);
```

**メリット**:
- ✅ セキュリティと利便性の両立
- ✅ 元のファイル名を保持
- ✅ 管理画面で表示可能

**デメリット**:
- ⚠️ データベーススキーマの変更が必要
- ⚠️ マイグレーションが必要

---

## 推奨アクション

**短期（Phase 1.5で対応）**:
- オプション1を採用
- Unicode対応のサニタイゼーションに変更
- テストケースを追加（日本語、特殊文字、パストラバーサル）

**中期（Phase 2以降）**:
- オプション3を検討
- 管理画面でファイル管理機能を追加する際に実装

---

## テストケース

### 必須テスト

| テストケース | 期待される動作 |
|-------------|---------------|
| `プロフィール.jpg` | 日本語が保持される |
| `../../../etc/passwd` | パストラバーサルが防止される |
| `file<script>.jpg` | 危険な文字が除去される |
| `テスト..画像.png` | `..` が適切に処理される |
| `😀emoji.jpg` | 絵文字が保持される（またはエラー） |

---

## 関連ファイル

- `src/actions/index.ts` (uploadAvatar アクション)
- `supabase/migrations/001_init.sql` (profiles テーブル)
- `.claude/security.md` (セキュリティガイドライン)

---

## 参考資料

- [OWASP - Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)
- [Supabase Storage - File Upload](https://supabase.com/docs/guides/storage)
- [RFC 3986 - Uniform Resource Identifier (URI)](https://www.rfc-editor.org/rfc/rfc3986)

---

## ラベル

`enhancement`, `i18n`, `security`, `user-experience`
