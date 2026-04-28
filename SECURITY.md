# Security Policy

## Reporting a Vulnerability (English summary)

If you discover a security vulnerability in this template, please report it **privately** through GitHub Private Vulnerability Reporting:

1. Go to the repository's **Security** tab.
2. Click **"Report a vulnerability"**.
3. Fill in the form. Only the maintainer can see your report.

**Do not open a public GitHub issue for security findings.** You will receive an acknowledgement within 5 business days. The detailed policy in Japanese follows below.

---

## 脆弱性の報告方法

このテンプレートに脆弱性を発見された場合は、**GitHub Private Vulnerability Reporting (PVR)** で非公開に報告してください:

1. 本リポジトリの **Security** タブを開く
2. **"Report a vulnerability"** ボタンをクリック
3. フォームに記入して送信

報告内容は repo メンテナのみが閲覧できます。スレッド内で対話・CVE 取得・修正・公開まで GitHub 上で完結します。

> ⚠️ **公開 Issue / Discussion での報告は避けてください。** 修正パッチが公開される前に exploit が広がる原因になります（responsible disclosure に反します）。GitHub アカウントが無いなど PVR を使えない事情があれば、SNS 経由で repo オーナー（[@michiof](https://github.com/michiof)）に連絡を取ってください。

報告に含めると助かる情報:

- 影響を受けるファイル・endpoint・コミット SHA
- 再現手順（最小化された PoC があれば理想）
- 想定される攻撃シナリオと影響範囲（誰の何が、どう壊れるか）
- 推奨される修正案（あれば）

## 対応プロセス

このプロジェクトは個人メンテナによる OSS テンプレートであり、商用製品のような SLA は提供できません。Best effort で対応します:

| フェーズ                 | 目安                                                             |
| ------------------------ | ---------------------------------------------------------------- |
| 受領確認                 | 営業日 5 日以内                                                  |
| 初期トリアージ・影響評価 | 受領後 14 日以内                                                 |
| 修正リリース             | 重大度に応じて優先度判断（Critical / High は最優先）             |
| 公開時期                 | 修正リリース後、報告者と相談のうえ調整（coordinated disclosure） |

軽微な指摘・false positive と判断したものについても、判定理由を返信します（無視はしません）。

## サポート対象

- `main` ブランチのみがサポート対象です（テンプレートはバージョンタグを切らない方針）
- フォークして派生プロジェクトを構築している場合は、本リポジトリではなくフォーク側のメンテナにご相談ください

## このテンプレートをフォークした方へ

このファイルはあなたのプロジェクトに **そのままでは適切ではありません**。フォーク後は以下を必ず差し替えてください:

1. GitHub Settings > Code security and analysis > **Private Vulnerability Reporting** を有効化（パブリックリポジトリで無料、有効化しないと "Report a vulnerability" ボタンが表示されません）
2. 「公開 Issue 不可」の連絡先を **あなたの組織の窓口** に変更（PVR を使えないレポーター向け fallback。メールにする場合は spam 対策を準備）
3. 対応プロセスの SLA を **あなたの運用実態** に合わせて調整
4. 必要なら [`/.well-known/security.txt`](https://www.rfc-editor.org/rfc/rfc9116)（RFC 9116）の追加も検討

セキュリティ実装の詳細・運用ハンドブック・脅威モデルは [.claude/security.md](.claude/security.md) と [.claude/security-ops.md](.claude/security-ops.md) を参照してください。
