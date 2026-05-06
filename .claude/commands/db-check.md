---
description: ローカル DB を reset → lint → test の順に検証する一括コマンド。マイグレーション編集後・PR 作成前のセルフチェックに使う
---

ローカルの Supabase Docker stack に対して、以下を順に実行してください。

## 前提

- Docker Desktop が起動している
- Supabase CLI (`supabase --version` で確認) がインストールされている
- `supabase start` で local stack が立ち上がっている（未起動なら `npm run db:start` を先に案内）

## 実行手順

各ステップは **直前のステップが成功した場合のみ次へ進む**。失敗したらユーザーに原因と推奨対応を提示して停止。

### 1. `npm run db:reset`

全マイグレーション (`supabase/migrations/*.sql`) を空 DB に適用し直す。

- 期待: すべての `create table` / `alter table enable row level security` / `create policy` / `create function` / `create trigger` が green
- 失敗パターンと対応:
  - SQL syntax error → 該当ファイル・行を報告
  - 既存環境を初期化したい場合は `supabase stop --backup=false && supabase start` で完全リセットを案内

### 2. `npm run db:lint`

plpgsql_check による静的解析。`security definer` 関数の `search_path` 漏れ、未使用変数、型不一致など。

- 期待: warning / error が 0
- 失敗パターン:
  - `function ... has no SET search_path` → security definer 関数に `set search_path = ''`（empty）が抜けている。SQL injection 経路になり得るので必ず追加。empty にする代わりに関数本体は `public.profiles` のように完全修飾する（[Supabase 公式推奨](https://supabase.com/docs/guides/database/functions)）

### 3. `npm run db:test`

pgTAP テスト (`supabase/tests/database/*.test.sql`) を実行。

- **pgTAP テスト未整備の場合** (Issue #35 着手前の状態) は `No tests found` で skip 扱い → エラー扱いせず ⚠️ で報告して次へ
- 整備後 (#35 merge 後) は全 plan 件数 PASS を確認

## 出力フォーマット

最後に以下を報告:

```
✅ db:reset    — N migrations applied
✅ db:lint     — 0 warnings, 0 errors
⚠️ db:test    — pgTAP not yet wired up (see #35)  ←整備後は ✅ + plan/pass 件数
```

すべて ✅ または ⚠️（test のみ skip）なら「マイグレーション編集は健全」と総括。
1 つでも ❌ なら **コミット前にブロック** することをユーザーに伝える。

## 関連

- Issue: #34 (Supabase CLI workflow 採用), #35 (pgTAP coverage), #36 (CI 自動実行)
- 公式 doc: <https://supabase.com/docs/guides/local-development/testing/overview>
