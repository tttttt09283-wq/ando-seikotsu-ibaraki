# A.I.T Follow Manager

A.I.T company が提供する、小規模店舗（整骨院・整体院・美容サロン等）向けの
**顧客フォロー管理 SaaS**です。来店後のフォロー漏れを防ぎ、関係維持と再来店につなげます。

> **現在のステータス：Phase 1 設計レビュー段階（実装未着手）**
> 設計内容の承認後、機能単位で実装を進めます。

## 開発フェーズ

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1 | 顧客管理・フォロー管理（外部送信なし） | 設計中 |
| Phase 2 | LINE公式アカウント連携 | 未着手（拡張ポイントのみ設計） |

Phase 1 では LINE Messaging API・Webhook・LINE認証・自動送信は**実装しません**。

## 設計ドキュメント

| # | ドキュメント | 内容 |
|---|---|---|
| 01 | [要件の不明点](docs/01_open-questions.md) | 確認事項と推奨デフォルト |
| 02 | [要件定義書（ドラフト）](docs/02_requirements.md) | 機能・非機能要件 |
| 03 | [画面構成・画面一覧](docs/03_screens.md) | MVP画面とルーティング |
| 04 | [DB設計書](docs/04_database.md) | ER図（Mermaid）・テーブル定義 |
| 05 | [マルチテナント・権限設計書](docs/05_tenancy-and-permissions.md) | ロール・RLS・サーバー側認可 |
| 06 | [フォロー抽出ロジック設計](docs/06_followup-extraction.md) | ルール評価・重複防止・除外 |
| 07 | [開発計画（6週間）・Phase 1 実装計画](docs/07_development-plan.md) | タスク・順序・完了条件 |

以下は実装と並行して作成します（07 に作成時期を記載）：
API仕様書 / テスト計画 / デプロイ手順 / `.env.example` / Phase 2 LINE連携拡張設計書。

## 技術構成（予定）

Next.js（App Router）/ TypeScript / Tailwind CSS / shadcn/ui / Supabase Auth /
PostgreSQL（Supabase）/ RLS / Vercel / Vitest / Playwright

バージョンは実装開始時に npm レジストリで安定版を確認して固定します（07 参照）。

## 配置について

このディレクトリは暫定的に既存リポジトリ内に置いています。
既存サイトの Vercel デプロイに含まれないよう、ルートの `.vercelignore` で除外しています。
本製品は複数企業へ販売する SaaS のため、**専用リポジトリへの移設を推奨**します（01 の Q1）。
