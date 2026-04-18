---

## ✅ 動作確認手順

### 1. ローカル起動確認

```bash
npm run dev
```

ブラウザで `http://localhost:4321` にアクセスし、以下を確認：
- [ ] エラーなく起動
- [ ] ページが正しく表示
- [ ] 実装した機能が動作

### 2. 機能テスト

**Phase固有の動作確認項目**:
（各Phaseのプロンプトで具体的に記載）

### 3. ブラウザコンソール確認

- [ ] エラーログがない
- [ ] 警告が最小限

### 4. レスポンシブ確認

- [ ] タブレット表示（768px以上）
- [ ] PC表示（1024px以上）

---

## 🔒 セキュリティチェックリスト

コミット前に必ず以下を確認してください：

### 必須チェック項目

- [ ] 環境変数（API Key、Secret）がハードコードされていない
- [ ] `.env`ファイルが`.gitignore`に含まれている
- [ ] ユーザー入力のバリデーション（フロント・バック）
- [ ] ファイルアップロード制限（拡張子・MIME・サイズ）
- [ ] エラーメッセージで内部情報を表示していない
- [ ] `v-html`を使用していない（XSS対策）

### 追加チェック（該当する場合）

- [ ] フォーム入力の型チェック・範囲チェック
- [ ] 画像アップロード：30MB制限実装
- [ ] APIレスポンスに不要なデータが含まれていない

詳細は[security.md](../.claude/security.md)を参照。

---

## 📦 コミット手順

### 1. git status確認

```bash
git status
```

**確認事項**:
- `.env`がコミット対象に含まれていないか
- 不要なファイルが含まれていないか

### 2. git diff確認

```bash
git diff
```

**確認事項**:
- 機密情報（API Key等）が含まれていないか
- デバッグコード・console.logが残っていないか

### 3. npm audit実行

```bash
npm audit
```

脆弱性がある場合は`npm audit fix`で修正。

### 4. コミット

```bash
git add .
git commit -m "$(cat <<'EOF'
[type]: [subject]

[body]

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**type**:
- `feat`: 新機能
- `fix`: バグ修正
- `refactor`: リファクタリング
- `style`: スタイル変更
- `docs`: ドキュメント

---

## 📝 Phase完了記録

Phase完了後、以下を`.claude/phases/phaseN.md`に記録してください：

```markdown
# Phase N: [タイトル]

**ステータス**: ✅ 完了
**開始日**: YYYY-MM-DD
**完了日**: YYYY-MM-DD

## 実装内容
- 実装した機能のリスト

## 変更ファイル
- 追加・編集したファイル一覧

## 動作確認
- テストした項目と結果

## 発生した問題と解決方法
- 問題内容
- 解決方法

## 次Phaseへの申し送り
- 注意事項など

## コミットハッシュ
- `git log --oneline -5`の結果
```

---

## ⚠️ トラブルシューティング

### ビルドエラー

```bash
npm install
npm run build
```

### 型エラー

TypeScriptの型定義を確認。`any`型を使用していないか確認。

### Supabase接続エラー

`.env`ファイルの環境変数を確認：
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

### 認証エラー

1. Supabase Dashboard > Authentication でユーザー確認
2. セッショントークン（Cookie）を確認
3. ミドルウェアが正しく動作しているか確認

---

## 📞 サポート

問題が発生した場合：
1. エラーログをそのまま報告
2. 実行したコマンドを報告
3. 期待する動作と実際の動作を説明

**参考ドキュメント**:
- [セキュリティガイドライン](../.claude/security.md)
- [開発ルール](../.claude/development.md)
- [アーキテクチャ](../.claude/architecture.md)

---

## 🎉 Phase完了後

1. Phase完了記録を作成
2. `.claude/phases/current.md`を更新（次Phaseに変更）
3. PMに報告：
   - コミットハッシュ
   - 動作確認スクリーンショット
   - 発生した問題（あれば）

---

**このプロンプトをClaude Codeの新しいセッションにコピーして実行してください。**
