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

> ⚠️ **公開 Issue / Discussion / SNS DM などで脆弱性の詳細を共有しないでください。** 修正パッチが公開される前に exploit が広がる原因になります（responsible disclosure に反します）。これらの経路は PVR と異なり暗号化保管・監査ログ・disclosure 調整の仕組みがなく、脆弱性情報を扱う前提で設計されていません。PVR を利用するには GitHub アカウント（無料）が必要です。

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
2. 対応プロセスの SLA を **あなたの運用実態** に合わせて調整
3. PVR を補完する非公開窓口を追加したい場合は、**専用の security メーリングリスト**（例: `security@your-domain.com` で alias + 暗号化転送）を用意してから記載してください。SNS DM・個人 email・公開 issue は脆弱性情報を扱う前提で設計されていないので fallback として案内しないこと
4. 必要なら [`/.well-known/security.txt`](https://www.rfc-editor.org/rfc/rfc9116)（RFC 9116）の追加も検討

セキュリティ実装の詳細・運用ハンドブック・脅威モデルは [.claude/security.md](.claude/security.md) と [.claude/security-ops.md](.claude/security-ops.md) を参照してください。
