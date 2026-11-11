# 株式会社Enejoy Hand 本部システム

予約管理システム（あんど整骨院の予約・会計）とは**別のシステム**です。全院・全部門を本部の立場で俯瞰して管理します。

| 部門 | できること |
|---|---|
| ダッシュボード | 全社売上・予算達成率・人件費率・新患数・スタッフ数・出店・研修・今月のやること、アラート |
| 業績 | 院別×月の予算・実績・達成率（7月始まりの年度）、全社の月別グラフ、年度累計 |
| 集客 | 新患数と来院経路（予約システムの初回来院）、集客施策の費用・獲得数・CPA |
| 人材 | 等級別の人数、院ごとの必要人数と過不足、スタッフ一覧、採用の進み具合 |
| 経理・事務 | 人件費42%枠（全社・院別）、毎月の定例チェック、支払い予定 |
| 教育 | 研修計画・対象等級・受講チェック、スタッフ別の受講率 |
| 組織図 | 代表 → GM → BM（エリア）→ 院長 → スタッフ（台帳から自動）、本部の部門と責任者 |
| キャリア | 等級（G1〜G6・S1〜S3）ごとの人数、一人ひとりの目指す等級・時期・育成メモ |
| 出店計画 | 新店の状態・開業予定日・初期費用・投資回収・マイルストーン |
| 年間計画 | 年度の方針・目標、月ごとの予定（カテゴリ別） |
| マンダラチャート | 会社・各院のマンダラの一覧と編集（マスの内容・月の状態） |

## しくみ

```
hq/                    ← この Vercel プロジェクトの Root Directory
├ index.html           画面（ログイン・11部門）
├ hq-logic.js          集計ロジック（テスト：../test/hq.test.js）
├ api/ledger.js        GET  台帳（売上・予算・人件費・スタッフ・等級・BMエリア）
├ api/mandala.js       GET/POST 会社・院のマンダラ
└ api/_hq-auth.js      管理者だけに使わせる確認
```

- ログイン：予約管理と同じ Supabase のアカウント。`clinic_staff.role = 'admin'` の人だけが使えます（院ID・個人PASSのログインは不可）
- 本部が入力した計画・台帳：Supabase の `hq_docs` テーブル（`../sql/2026-11-11_hq_docs.sql`、管理者だけ読み書き可）
- 台帳の読み込みは予約管理と同じ処理（`../lib/`）を使います

## デプロイ（Vercel・初回だけ）

1. Vercel で **Add New → Project** → このリポジトリを Import
2. **Root Directory** に `hq` を指定（Framework Preset は Other）
3. 「Include files outside the root directory in the Build Step」を **ON**（既定でON。`../lib` を使うため）
4. **Environment Variables** に、予約管理のプロジェクトと同じ値を入れる
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - （設定している場合）`SALES_SHEET_ID` / `CAREER_SHEET_ID` / `NEWPATIENT_SHEET_ID` / `PATIENT_CARE_SHEET_ID`
5. Deploy。以後は main にマージすると自動で更新されます

予約管理システム側のデプロイには `hq/` は含めていません（リポジトリ直下の `.vercelignore`）。
