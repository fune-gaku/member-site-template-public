#!/bin/bash

set -e

echo "🚀 Claude Code プロジェクトセットアップ"
echo "=========================================="
echo ""

# カラー定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# プロジェクト情報の入力
echo -e "${BLUE}📝 プロジェクト情報を入力してください${NC}"
echo ""

read -p "プロジェクト名: " PROJECT_NAME
read -p "プロジェクト概要（1行）: " PROJECT_DESCRIPTION
read -p "使用者数（例: 画家本人とMichioの2名のみ）: " USER_COUNT
read -p "開発方針（例: シンプルで使いやすいUIを優先）: " PROJECT_POLICY

echo ""
echo -e "${BLUE}🛠️  技術スタック${NC}"
read -p "フロントエンドフレームワーク（例: Astro 6）: " FRONTEND_FRAMEWORK
read -p "UIライブラリ（例: Vue 3）: " UI_LIBRARY
read -p "CSSフレームワーク（例: Tailwind CSS v4）: " CSS_FRAMEWORK
read -p "バックエンド（例: Supabase）: " BACKEND
read -p "デプロイ先（例: Cloudflare Pages）: " DEPLOY_TARGET

echo ""
echo -e "${BLUE}🗄️  データベース${NC}"
read -p "DBMS（例: PostgreSQL (Supabase)）: " DBMS
read -p "スキーマ管理方法（例: Supabase Dashboard）: " SCHEMA_MANAGEMENT

echo ""
echo -e "${YELLOW}⚙️  カスタマイズ中...${NC}"

# CLAUDE.mdのカスタマイズ
sed -i.bak "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" .claude/CLAUDE.md
sed -i.bak "s/{{PROJECT_DESCRIPTION}}/$PROJECT_DESCRIPTION/g" .claude/CLAUDE.md
sed -i.bak "s/{{USER_COUNT}}/$USER_COUNT/g" .claude/CLAUDE.md
sed -i.bak "s/{{PROJECT_POLICY}}/$PROJECT_POLICY/g" .claude/CLAUDE.md
sed -i.bak "s/{{DEPLOY_TARGET}}/$DEPLOY_TARGET/g" .claude/CLAUDE.md

# architecture.mdのカスタマイズ
TECH_STACK_TABLE="| フロントエンド | $FRONTEND_FRAMEWORK | - | フレームワーク |
| UIライブラリ | $UI_LIBRARY | - | コンポーネント |
| CSS | $CSS_FRAMEWORK | - | スタイリング |
| バックエンド | $BACKEND | - | DB・Auth・Storage |
| デプロイ | $DEPLOY_TARGET | - | ホスティング |"

# プレースホルダーを実際の値に置換（複数行対応）
# Note: sedでの複数行置換は複雑なため、一旦簡略化
# 実際のプロジェクトではPythonやNode.jsスクリプトを使用することを推奨

# database.mdのカスタマイズ
sed -i.bak "s/{{DBMS}}/$DBMS/g" .claude/database.md
sed -i.bak "s/{{SCHEMA_MANAGEMENT}}/$SCHEMA_MANAGEMENT/g" .claude/database.md

# development.mdのカスタマイズ
sed -i.bak "s/{{CSS_FRAMEWORK}}/$CSS_FRAMEWORK/g" .claude/development.md

# deployment.mdのカスタマイズ
sed -i.bak "s/{{DEPLOY_TARGET}}/$DEPLOY_TARGET/g" .claude/deployment.md

# phases/current.mdのカスタマイズ
START_DATE=$(date +%Y-%m-%d)
sed -i.bak "s/{{START_DATE}}/$START_DATE/g" .claude/phases/current.md

# バックアップファイル削除
find .claude -name "*.bak" -delete

echo ""
echo -e "${GREEN}✅ セットアップ完了！${NC}"
echo ""
echo -e "${BLUE}📋 次のステップ:${NC}"
echo "1. .claude/CLAUDE.md を確認・編集"
echo "2. .claude/database.md にスキーマ情報を追加"
echo "3. .claude/architecture.md にディレクトリ構成を追加"
echo "4. .claude/development.md のコーディング規約を確認"
echo "5. Phase 0のプランを作成"
echo ""
echo -e "${YELLOW}⚠️  重要: プレースホルダー（{{...}}）が残っている箇所は手動で編集してください${NC}"
echo ""
echo "詳細は .claude/CLAUDE.md を参照してください。"
