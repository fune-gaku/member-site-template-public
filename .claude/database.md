# データベース設計

## 概要

- **DBMS**: PostgreSQL (Supabase)
- **スキーマ管理**: Supabase Migrations (supabase/migrations/*.sql を Git で管理し、本番適用は SQL Editor から手動実行)
- **RLS（Row Level Security）**: {{RLS_POLICY}}

---

## テーブル一覧

| テーブル名 | 説明 | 主要カラム |
|-----------|------|----------|
{{TABLES_LIST}}

---

## 主要テーブル定義

### {{TABLE_NAME_1}}

| カラム名 | 型 | 制約 | 説明 |
|---------|---|------|------|
{{TABLE_DEFINITION_1}}

**インデックス**:
{{INDEXES_1}}

---

## ビュー

### {{VIEW_NAME_1}}

**用途**: {{VIEW_PURPOSE_1}}

```sql
{{VIEW_DEFINITION_1}}
```

---

## トリガー

### {{TRIGGER_NAME_1}}

```sql
{{TRIGGER_DEFINITION_1}}
```

---

## リレーション図

```
{{RELATION_DIAGRAM}}
```

---

## データアクセスパターン

### {{PATTERN_NAME_1}}

```typescript
{{ACCESS_PATTERN_1}}
```

---

## Storage構成

### Buckets

| バケット名 | 公開設定 | 用途 |
|-----------|---------|------|
{{STORAGE_BUCKETS}}

---

## マスタデータ

{{MASTER_DATA}}

---

## 注意事項

{{DATABASE_NOTES}}
