# A.I.T Follow Manager

A.I.T company が提供する、小規模店舗（整骨院・整体院・美容サロン等）向けの
**顧客フォロー管理 SaaS**です。来店後のフォロー漏れを防ぎ、関係維持と再来店につなげます。

> **ステータス：Phase 1 をローカル環境で実装済み（本番未デプロイ）**
> 外部への送信・課金・実データの投入・本番デプロイは行っていません（事前承認が必要）。

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | 顧客管理・フォロー管理（外部送信なし） | ローカルで実装・テスト済み |
| Phase 2 | LINE公式アカウント連携 | 設計のみ（[11_phase2-line.md](docs/11_phase2-line.md)） |

## できること（Phase 1）

- **フォロータスクの自動抽出**（毎朝）：初回来店後／最終来店後／予約未確認／前回フォロー後。重複生成なし、配信停止・連絡不可は除外
- **タスク対応**：テンプレート文面をワンタップでコピー → 別ツールで送信 → 結果をチップで記録（このシステムからは送信しない）
- **顧客管理**：検索・絞り込み、来店・予約・メモ・タグ、連絡同意／配信停止の履歴、CSV 取込・エクスポート、個人情報の削除（匿名化）
- **ダッシュボード・分析**：今日・期限切れ・未対応・完了・再来店確認・店舗別（因果関係を断定しない表示）
- **マルチテナント・4ロール**：Platform Admin / 組織管理者 / 店舗責任者 / スタッフ。RLS とサーバー側認可の二重防御、監査ログ、管理者の2段階認証

## すぐに試す（ローカル・無料）

必要：Node.js 22、Docker

```bash
cd ait-follow-manager
npm ci
npm run db:start      # ローカル Supabase を起動
cp .env.example .env.local   # `npx supabase status -o env` の値を設定
npm run db:reset      # マイグレーション＋架空データ
npm run dev           # http://localhost:3000
```

デモアカウント（パスワード `DemoPass1234`、すべて架空）：
`admin@example.com` 組織管理者 / `manager@example.com` 店舗責任者 / `staff@example.com` スタッフ / `platform@example.com` 運営管理

フォロータスクを生成するには、「その他 → フォロー条件 → 今すぐ抽出」（管理者）を実行してください。

## テスト

```bash
npm test            # 単体（76件）
npm run test:db     # DB 統合：RLS・権限・抽出・重複防止（67件、ローカル Supabase が必要）
npm run build && npm run test:e2e   # E2E：スマホ・PC（17件）
```

## ドキュメント

| # | ドキュメント |
|---|---|
| 01 | [要件の不明点と推奨デフォルト](docs/01_open-questions.md) |
| 02 | [要件定義書](docs/02_requirements.md) |
| 03 | [画面構成・画面一覧](docs/03_screens.md) |
| 04 | [DB設計書（ER図）](docs/04_database.md) |
| 05 | [マルチテナント・権限設計書](docs/05_tenancy-and-permissions.md) |
| 06 | [フォロー抽出ロジック設計](docs/06_followup-extraction.md) |
| 07 | [開発計画（6週間）・実装計画](docs/07_development-plan.md) |
| 08 | [API仕様書](docs/08_api.md) |
| 09 | [テスト計画・結果](docs/09_test-plan.md) |
| 10 | [デプロイ手順・運用](docs/10_deploy.md) |
| 11 | [Phase 2 LINE連携 拡張設計書](docs/11_phase2-line.md) |

## 構成

```
app/                 画面（App Router）と Server Actions
  o/[orgSlug]/       業務画面（組織は URL で指定し、毎回所属を検証）
  platform/          運営管理
  api/               CSV エクスポート・日次 Cron
components/          UI（shadcn/ui 形式）
lib/auth/            権限の単一定義（permissions.ts）・組織コンテキスト
lib/followup/        抽出ロジック（純粋関数）と抽出ジョブ
lib/csv/             CSV の検証・出力
supabase/migrations/ スキーマ・RLS・関数
supabase/seed.sql    架空のデモデータ（本番には投入しない）
tests/               unit / db / e2e
```

技術：Next.js 16（App Router）/ React 19 / TypeScript 5 / Tailwind CSS 4 / shadcn/ui 形式のコンポーネント /
Supabase（Auth・PostgreSQL・RLS）/ Vitest 5 / Playwright

## 配置について

既存サイト（安藤整骨院）のリポジトリ内に暫定配置しています。ルートの `.vercelignore` で既存サイトのデプロイから除外済みです。
販売する SaaS のため、専用リポジトリへの移設を推奨します。
