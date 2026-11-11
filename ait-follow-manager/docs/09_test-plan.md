# 09. テスト計画・結果

## 1. テストの種類

| 種類 | ツール | 対象 | 実行コマンド |
|---|---|---|---|
| 単体 | Vitest | 抽出ロジック、権限定義、CSV 検証・出力、テンプレート、日付 | `npm test` |
| DB 統合 | Vitest ＋ ローカル Supabase | RLS・制約・トリガー・RPC・抽出ジョブ（実際の Auth ユーザーでログインして検証） | `npm run test:db` |
| E2E | Playwright（Pixel 7 / Desktop Chrome） | スマホでの主要操作、権限外画面、エクスポート | `npm run test:e2e` |
| 静的解析 | ESLint（`react/no-danger` 等）・TypeScript | 全コード | `npm run lint` / `npm run typecheck` |

テストデータはすべて架空（`supabase/seed.sql`、氏名は架空、電話 `090-0000-xxxx`、メール `example.com`）。

## 2. 必須テストと対応するテスト

| 必須項目 | テスト |
|---|---|
| 他組織のデータへアクセスできない | `tests/db/tenant-isolation.test.ts`（15テーブル×他社管理者、ID 直接指定、他社店舗との組み合わせ、anon、Platform Admin、全テーブル RLS/force 有効の検査、anon 権限なし）、E2E「他組織の画面は表示されない」 |
| 権限外操作ができない | `tests/unit/permissions.test.ts`（権限マトリクス全セル）、`tests/db/permissions.test.ts`（他店舗閲覧、派生列の直接更新、匿名化、物理削除、ルール・テンプレート・スタッフ追加、自己昇格、監査ログ、タスク割当、ルール由来タスクの直接作成、閲覧範囲設定、停止組織）、E2E「権限外の画面」 |
| 顧客の登録・編集・検索 | `tests/db/customers.test.ts`、E2E「顧客を検索し、登録・編集できる」「不正な入力」 |
| CSV 取込の不正データ処理 | `tests/unit/csv.test.ts`（文字コード、サイズ、行数、バイナリ、ヘッダー重複、必須列、形式、重複、権限外・存在しない店舗、数式、担当者、長さ、引用符）、E2E「CSV 取込で不正データ」 |
| フォロータスクの抽出 | `tests/unit/evaluate.test.ts`（境界値・種別・担当決定）、`tests/db/followup.test.ts` |
| タスク重複防止 | 同日2回・翌日以降・並行実行・一意制約・再来店時の新期間（DB 統合）、E2E「今すぐ抽出で新規0件」 |
| 連絡不可顧客の除外 | 単体（除外条件）、DB（配信停止・連絡不可・同意未確認の設定・停止記録時の自動対象外） |
| テンプレートの編集・コピー | `tests/db/templates.test.ts`、`tests/unit/templates.test.ts`、E2E「テンプレートを複製・編集」「文面をコピー」 |
| スマホ画面での主要操作 | `tests/e2e/mobile.spec.ts`（Pixel 7） |

## 3. 実行結果（2026-11-11、ローカル環境）

| 種類 | 結果 |
|---|---|
| 単体 | 76 / 76 合格 |
| DB 統合 | 67 / 67 合格 |
| E2E | 17 / 17 合格 |
| ESLint / TypeScript / `next build` | エラーなし |

## 4. 未実施・今後
- 性能試験（架空1万件での一覧表示）：W6 で実施予定
- 実機（iOS Safari）での確認：試験運用前に実施（CI は Chromium のみ）
- MFA（TOTP）：`REQUIRE_ADMIN_MFA=true` で起動し、Playwright スクリプトで「初回ログイン→QR 登録→コード確認→ダッシュボード」「再ログイン→コード入力→ダッシュボード」を確認済み（2026-11-11）。自動テスト化は今後（他の E2E と設定値が異なるため）
- GitHub Actions 上での実行：ワークフローは用意済み、未実行
