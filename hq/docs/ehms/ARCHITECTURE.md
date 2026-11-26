# EHMS アーキテクチャ

```
ブラウザ（本部システム hq/index.html ＋ hq/ehms-ui.js）
   │  ログイン：Supabase Auth（予約管理と同じアカウント）
   │  読み書き：Supabase REST（利用者のトークン）→ 行単位の権限（RLS）で守る
   │  計算：hq/ehms-calc.js（共通計算エンジン。画面ごとに式を書かない）
   ▼
Supabase（PostgreSQL）  ehms_* テーブル・関数・トリガー（sql/2026-11-25_ehms_phase1.sql）
   ├ マスター：ehms_business_units / ehms_stores / ehms_accounts / ehms_settings
   ├ 数字：ehms_monthly_records（金額）／ehms_monthly_metrics（人数・件数など）
   ├ 締め：ehms_month_closes（締めた月の実績はトリガーで変更不可）
   ├ 取り込み：ehms_import_jobs（ファイルのハッシュ・件数・エラー行）
   ├ 履歴：ehms_audit_logs（全テーブルの追加・変更・削除をトリガーで記録）
   └ 権限：ehms_user_roles ＋ 関数 ehms_role() / ehms_can_read_store() / ehms_can_write_store()

本部システムの既存機能（Vercel の hq/api/*：台帳・組織図・日計表・シフト・KPI の読み込み）は今までどおり。
EHMS は Vercel の関数を増やさず、ブラウザ → Supabase で動く（Hobby プランの関数数の上限に当たらない）。
```

## ファイル
| ファイル | 役割 |
|---|---|
| `hq/ehms-calc.js` | 共通計算エンジン（PL・年間集計・予算差異・着地予測・本部経費配賦・必要売上・昇給影響・損益分岐点・人員配置・アラート）。すべて `{ value, formula, inputs, version }` で根拠を返せる |
| `hq/ehms-ui2.js` | Phase 2 の画面（既存シートの取り込み・スタッフ／生産性・必要売上根拠シミュレーター・適正人員配置） |
| `hq/ehms-ui.js` | EHMS の画面（全社・院別ダッシュボード、月次PL、年間PL・推移・着地、マスター、入出力、権限・締め・履歴） |
| `hq/index.html` | 本部システム本体。サイドメニュー「EHMS 経営管理」から各画面へ |
| `hq/hq-logic.js` | 本部システムの既存ロジック（メニューの定義も） |
| `sql/2026-11-25_ehms_phase1.sql` | Phase 1 のマイグレーション（テーブル・RLS・トリガー・初期マスター） |
| `test/ehms-calc.test.js` | 計算テスト（要件 36 のテスト1〜5 ＋ 売上ゼロ・未入力・赤字・加重平均・配賦・年度切り替え・着地予測・アラート） |

## 画面とメニュー（ルーティング）
本部システムは1ページのアプリで、サイドメニューの ID で画面を切り替える（`S.sec`）。

| メニュー ID | 画面 |
|---|---|
| `ehms_dash` | 全社経営ダッシュボード |
| `ehms_store` | 院別ダッシュボード（ランキング・配賦前／後） |
| `ehms_pl` | 月次PL（予算・実績の入力） |
| `ehms_year` | 年間PL・年間推移・着地予測 |
| `ehms_io` | データ入出力（CSV・Excel） |
| `ehms_master` | マスター設定 |
| `ehms_admin` | 権限・月次締め・変更履歴 |
| `ehms_staff` | スタッフ・生産性 |
| `ehms_required` | 必要売上根拠シミュレーター |
| `fit` | 適正人員配置（需要から＋組織図×予算＋問題点） |

上部の共通バー：年度・月・店舗（全社／各院／本部）・デモ切り替え・印刷。実績／予算／予測は保存時の区分で分け、画面では列（予算・実績・差額・達成率・前年）や切り替えボタンで見せる。

## 将来の Phase での拡張方針
- 人事（Phase 2）：employees・employee_compensation などを `ehms_` で追加。給与は既存の `hq_private_docs`（salary_viewer のみ）と同じ方針で、行単位の権限を必須にする。
- 資金繰り（Phase 3）：cash_flow_records・receivables・loan_records を追加し、PL（ehms_monthly_records）と別に持つ（利益と現金を混同しない）。
- シナリオ（Phase 5）：`scenario` 列（初期値 base）で、確定実績・承認済み予算を書き換えずに複製・比較する。
