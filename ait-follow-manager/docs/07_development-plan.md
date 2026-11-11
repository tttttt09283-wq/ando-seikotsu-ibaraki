# 07. 開発計画（6週間）・Phase 1 実装計画

## 1. 技術スタック（2026-11-11 時点の npm 最新安定版。着手時に再確認して固定）

| パッケージ | 確認版 | 備考 |
|---|---|---|
| next | 16.4.x | App Router |
| react | 19.3.x | |
| typescript | 7.0.x | 新コンパイラ。Next.js・ESLint との互換性を着手時に検証し、問題があれば 5.x 系最新に固定 |
| tailwindcss | 4.3.x | |
| shadcn（CLI） | 4.23.x | 必要なコンポーネントのみ追加 |
| @supabase/supabase-js | 2.119.x | |
| @supabase/ssr | 0.12.x | Cookie セッション |
| supabase（CLI） | 3.1.x | ローカル DB・マイグレーション・型生成 |
| zod | 4.6.x | 入力検証 |
| vitest | 5.1.x | 単体・DB統合テスト |
| @playwright/test | 1.65.x | E2E（スマホ表示を含む） |

`package.json` では `^` を使わず完全一致で固定し、`package-lock.json` をコミットする。

## 2. ディレクトリ構成（予定）

```
ait-follow-manager/
├─ app/
│  ├─ (auth)/login, forgot-password, reset-password, invite/[token], mfa
│  ├─ o/[orgSlug]/dashboard, tasks, customers, templates, analytics, settings
│  ├─ platform/
│  └─ api/cron/generate-tasks/route.ts
├─ components/            # shadcn/ui ＋ 業務コンポーネント
├─ lib/
│  ├─ auth/               # authorize(), permissions.ts（権限の単一定義）
│  ├─ followup/           # evaluate.ts（純粋関数）, generate.ts
│  ├─ csv/                # parse・validate・export（数式インジェクション対策）
│  ├─ db/                 # Supabase クライアント（server-only / browser）、生成型
│  └─ validation/         # zod スキーマ
├─ supabase/
│  ├─ migrations/         # スキーマ・RLS・関数
│  └─ seed.sql            # 架空データのみ
├─ tests/
│  ├─ unit/               # Vitest
│  ├─ db/                 # RLS・制約の統合テスト（ローカル Supabase）
│  └─ e2e/                # Playwright（iPhone / Pixel / Desktop）
└─ docs/
```

## 3. 6週間の開発タスク

| 週 | テーマ | 主なタスク | 完了条件 |
|---|---|---|---|
| **W1** | 基盤・テナント分離 | プロジェクト雛形（Next.js/Tailwind/shadcn/ESLint/Prettier）、CI（型・lint・Vitest・Playwright）、ローカル Supabase、organizations/stores/users/memberships/platform_admins/audit_logs のマイグレーション、RLS ヘルパー関数、認証（ログイン・再設定・セッション）、`authorize()` | **他組織データにアクセスできない**ことを DB テストで確認。RLS 未設定表検出テストが通る |
| **W2** | 組織・店舗・スタッフ／顧客 | 招待・スタッフ管理・ロール変更、店舗管理、Platform Admin の組織作成、customers/tags の CRUD・検索（pg_trgm）・絞り込み、顧客一覧・詳細（基本情報） | 権限外操作が拒否されるテスト、顧客の登録・編集・検索テスト |
| **W3** | 来店・予約・同意・CSV | visits/appointments/consent_records、派生列トリガー、顧客詳細の各タブ、メモ、CSV 取込（検証・プレビュー・確定・エラーレポート、UTF-8/Shift_JIS） | 不正 CSV（列不足・型不正・重複・他店舗コード・巨大ファイル・数式）の処理テスト |
| **W4** | フォロー抽出・タスク | followup_rules 設定画面・プレビュー、`evaluateRule`、生成ジョブ・Cron・今すぐ抽出、followup_tasks 一覧・詳細・対応記録（contact_logs）、自動対象外処理 | 抽出・重複防止・連絡不可除外のテスト |
| **W5** | テンプレート・ダッシュボード・分析・データ管理 | message_templates（初期5種投入・編集・複製・コピー・変数プレビュー）、ダッシュボード、分析（因果を示さない注記）、顧客エクスポート・匿名化削除、監査ログ画面 | テンプレート編集・コピーのテスト、エクスポート／削除の監査記録 |
| **W6** | 品質・ドキュメント・試験運用準備 | Playwright でスマホ主要操作、セキュリティレビュー（RLS 全表・CSP・service_role 使用箇所）、性能確認（架空1万件）、API仕様書・テスト計画・デプロイ手順・Phase 2 設計書の完成、ステージング構築（**要承認**） | 全自動テスト合格、ドキュメント一式、デモ組織で操作確認 |

## 4. 機能単位の実装順と報告タイミング

各機能の完了時に **実装内容・テスト結果・未完了項目** を報告し、確認後に次へ進みます。

| # | 機能単位 | 依存 | 作成するドキュメント |
|---|---|---|---|
| 1 | 雛形・CI・ローカル DB | — | `.env.example`、README のセットアップ手順 |
| 2 | テナント基盤（スキーマ・RLS・認証・authorize） | 1 | DB設計書・権限設計書を実装に合わせ更新、テスト計画（初版） |
| 3 | 組織・店舗・スタッフ管理 | 2 | API仕様書（初版：Server Actions 一覧） |
| 4 | 顧客管理（CRUD・検索・タグ） | 2 | |
| 5 | 来店・予約・同意 | 4 | |
| 6 | CSV 取込 | 4,5 | CSV フォーマット仕様 |
| 7 | フォロールール・抽出エンジン | 5 | |
| 8 | タスク管理・対応記録 | 7 | |
| 9 | テンプレート | 2 | |
| 10 | ダッシュボード・分析 | 8 | |
| 11 | データエクスポート・削除・監査ログ画面 | 4 | |
| 12 | E2E・セキュリティレビュー・仕上げ | 全体 | デプロイ手順、Phase 2 LINE連携拡張設計書、画面一覧更新 |

## 5. テスト計画（概要。詳細は機能2で作成）

| 必須テスト | 種別 | 方法 |
|---|---|---|
| 他組織のデータへアクセスできない | DB統合 | 2組織×各ロールのユーザーで全テナント表の SELECT/INSERT/UPDATE を試行し0件・拒否を確認 |
| 権限外操作ができない | DB統合＋単体 | 権限マトリクス（05）の全セルを `permissions.ts` から自動生成してテスト |
| 顧客の登録・編集・検索 | 単体＋E2E | |
| CSV 取込の不正データ処理 | 単体 | 不正パターン集（列不足・文字コード・型・重複・サイズ・数式・他組織の店舗コード） |
| フォロータスクの抽出 | 単体 | 06 §9 の境界値 |
| タスク重複防止 | DB統合 | 二重実行・並行実行 |
| 連絡不可顧客の除外 | 単体＋DB統合 | |
| テンプレートの編集・コピー | 単体＋E2E | クリップボードはブラウザ権限付きで検証 |
| スマホ画面での主要操作 | E2E | Playwright の iPhone/Pixel デバイスでログイン→タスク対応→記録、顧客検索、配信停止 |

テストデータは**すべて架空**（`seed.sql` とテスト用ファクトリ。氏名は「テスト 太郎」等、電話番号は `090-0000-xxxx`）。

## 6. 事前承認が必要な作業（実施前に必ず確認します）

- Supabase / Vercel のプロジェクト作成・有料プラン契約
- 本番環境へのデプロイ（ステージングを含む外部公開環境）
- 外部へのメッセージ送信（Phase 1 では実装しない）
- 課金処理（Phase 1 では実装しない）
- 実在の顧客データの投入

## 7. 次のステップ

1. 01 の確認事項（特に **Q1 リポジトリ、Q2〜Q4 環境作成、Q6 同意未確認の扱い、Q7 Staff の閲覧範囲**）へのご回答
2. 本設計（画面構成・ER図・権限・抽出ロジック・計画）の承認
3. 承認後、機能単位 #1（雛形・CI・ローカル DB）から着手。ローカル Supabase で開発するため、外部環境の作成なしで #1〜#2 は進められます
