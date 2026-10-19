# A.I.T Cash Flow — 設計書（PLAN）

従業員1〜10名の小規模企業の経営者が、**今の現預金・入金予定・支払予定・将来の資金不足リスク**を一目で把握するためのWebアプリ。

- 対象：日本の小規模企業（日本語UI・日本円・Asia/Tokyo）
- 方針：手入力とCSV取込を先に完成させ、銀行・会計ソフト・決済サービスとの直接接続は **別途承認後** に行う
- 実データがない画面では「デモデータ」と明示し、架空の実績を本物のように見せない

---

## 0. リポジトリ調査の結果

| 場所 | 内容 | 本プロジェクトとの関係 |
|---|---|---|
| ルートの `*.html`・`api/`・`body-check/` | あんど整骨院の既存システム（静的HTML＋Vercel Functions） | **変更しない** |
| `ait-company-os/` | A.I.T company の業務OS（Next.js） | 変更しない |
| `enejoy-hand-ai/` | Enejoy Hand AI部門アプリ（Next.js 16・Tailwind v4・zod・vitest） | 変更しない。技術構成・UI部品の作法をそろえる |
| `ait-cashflow/`（新規） | **本プロジェクト** | ここだけに追加する |

既存アプリと同じく Next.js 16（App Router・`proxy.ts`）・React 19・TypeScript・Tailwind CSS v4・shadcn/ui 方式のUI部品・Zod 4・Vitest を使う。追加で Supabase（PostgreSQL / Auth / RLS）・Recharts を使う。

---

## 1. アーキテクチャ

```
ブラウザ（スマホ優先のUI）
  │  Server Components で表示・Server Actions で更新（Zodで検証・レート制限）
  ▼
Next.js（ait-cashflow）
  ├─ src/lib/cash/       … 資金計算の本体（純粋なTypeScript。DBにもAIにも依存しない＝テストで検証できる）
  │    money / dates(Asia/Tokyo) / recurrence / forecast / balances / scenarios / alerts
  ├─ src/lib/data/       … データの読み書き（Repository）
  │    ├─ supabase.ts    … 本番：ログイン中のユーザーのJWTでSupabaseに接続。RLSで企業ごとに分離
  │    └─ demo.ts        … デモ：Supabase未設定のときだけ。メモリ上の架空データ（画面に「デモデータ」と常時表示）
  ├─ src/app/            … 画面（App Router）
  └─ proxy.ts            … セッションの更新・未ログイン時のリダイレクト
  ▼
Supabase
  ├─ Auth（メール＋パスワード、メール確認）
  ├─ PostgreSQL（supabase/migrations/*.sql）… 全業務テーブルに organization_id・RLS・監査トリガー
  └─ （将来）Edge Functions / Storage（CSV原本の保管）
```

### 原則
1. **計算の真実の源泉はTypeScriptの計算ロジックとDB**。AIは検証済みの集計結果を受け取り、要約・説明・下書きだけを作る（フェーズ4）。
2. **認証なしに実データへは到達できない**。Supabaseモードでは全ページ・全操作でセッションを確認し、さらにRLSでDB側でも拒否する（二重の防御）。サービスロールキーはアプリで使わない。
3. **デモモードは開発・見学用**。`NEXT_PUBLIC_SUPABASE_URL` 未設定時のみ有効。本番ビルド（`NODE_ENV=production`）では `CASHFLOW_ALLOW_DEMO=1` を明示しない限り起動を拒否する。
4. **金額は円の整数（bigint）**、日付は Asia/Tokyo の暦日（`date`型・`YYYY-MM-DD`）、時刻は `timestamptz`。
5. 外部連携（会計ソフト・銀行API）は `import_jobs.source` と `ImportSource` インターフェースを拡張点として設計だけ用意し、実装はフェーズ5で承認後。

---

## 2. 画面一覧

| # | 画面 | パス | 主な内容 | フェーズ |
|---|---|---|---|---|
| 1 | ログイン | `/login`・`/signup`・`/auth/confirm` | メール＋パスワード、メール確認、ログアウト | 2 |
| 2 | ダッシュボード | `/` | 現預金残高・7/30/90日後の予測残高・入金予定・支払予定・未確定取引・日別推移グラフ・資金不足予測日・最低必要残高との差・最終更新日時・データの出所・未更新警告・店舗切替 | 2 |
| 3 | 入出金一覧 | `/transactions` | 予定・確定・取消の一覧、手入力、確定処理、取消、振替、定期設定 | 2 |
| 4 | 予定取引カレンダー | `/calendar` | 月表示の入金・支払予定、支払集中日 | 3 |
| 5 | 資金予測 | `/forecast` | 保守・標準・楽観、7/30/90/180日、感度分析 | 3 |
| 6 | CSV取込 | `/import` | 文字コード判定・列マッピング・プレビュー・重複検知・エラーレポート | 3 |
| 7 | AI分析 | `/assistant` | 同意取得後、検証済み集計の要約・リスク説明・下書き | 4 |
| 8 | 設定 | `/settings` | 企業・店舗・口座・残高登録・メンバーと権限・最低必要残高 | 2 |

モバイルファースト：下部タブ（ホーム／入出金／予測／取込／設定）、PCは左サイドバー。

---

## 3. ER図

```mermaid
erDiagram
  organizations ||--o{ organization_members : has
  organizations ||--o{ branches : has
  organizations ||--o{ bank_accounts : has
  branches |o--o{ bank_accounts : "店舗の口座（本部口座は店舗なし）"
  bank_accounts ||--o{ balance_snapshots : "基準日の確定残高"
  bank_accounts ||--o{ cash_transactions : "入出金"
  branches |o--o{ cash_transactions : "店舗タグ"
  recurring_rules |o--o{ cash_transactions : "繰返しから作った回"
  bank_accounts ||--o{ recurring_rules : ""
  import_jobs ||--o{ import_rows : ""
  import_rows |o--o| cash_transactions : "取り込んだ明細"
  organizations ||--o{ forecast_scenarios : ""
  organizations ||--o{ alert_rules : ""
  organizations ||--o{ alerts : ""
  organizations ||--o{ audit_logs : ""

  organizations { uuid id PK; text name; bigint min_balance_jpy; int stale_after_days }
  organization_members { uuid organization_id PK,FK; uuid user_id PK,FK; text role "owner|accountant|viewer" }
  branches { uuid id PK; uuid organization_id FK; text name; bool is_active }
  bank_accounts { uuid id PK; uuid organization_id FK; uuid branch_id FK "NULL=本部"; text name; text bank_name; text kind "bank|cash|other"; text number_last4; bigint min_balance_jpy }
  balance_snapshots { uuid id PK; uuid organization_id FK; uuid bank_account_id FK; date as_of_date; bigint balance_jpy; text source }
  cash_transactions { uuid id PK; uuid organization_id FK; uuid bank_account_id FK; uuid branch_id FK; text direction "in|out"; text category; bigint amount_jpy; date planned_date; date confirmed_date; text status "planned|confirmed|canceled"; text certainty "fixed|expected"; uuid transfer_group_id; uuid recurring_rule_id; date occurrence_date; text dedupe_key }
  recurring_rules { uuid id PK; uuid organization_id FK; uuid bank_account_id FK; text frequency "monthly|weekly|yearly"; int interval; int day_of_month; date start_date; date end_date; text weekend_shift }
  import_jobs { uuid id PK; uuid organization_id FK; text source; text file_hash; text status }
  import_rows { uuid id PK; uuid import_job_id FK; int row_number; text row_hash; text status }
  forecast_scenarios { uuid id PK; uuid organization_id FK; text kind; jsonb assumptions }
  alert_rules { uuid id PK; uuid organization_id FK; text kind; jsonb params }
  alerts { uuid id PK; uuid organization_id FK; text dedupe_key; date target_date; bigint amount_jpy }
  audit_logs { bigint id PK; uuid organization_id FK; uuid actor_id; text action; text table_name; jsonb before; jsonb after }
```

### 主な制約
- 全業務テーブルに `organization_id NOT NULL`（外部キー・`ON DELETE CASCADE`）。子テーブルは**同じ企業の親だけを参照できる**よう `(organization_id, id)` の複合外部キーを使う（他社の口座IDを指定しても登録できない）。
- `cash_transactions`
  - `amount_jpy > 0`（向きは `direction`）
  - `status='planned'` → `planned_date` 必須、`status='confirmed'` → `confirmed_date` 必須
  - `category='transfer'` ⇔ `transfer_group_id` あり。振替は同じ `transfer_group_id` の出金1件＋入金1件
  - `UNIQUE (recurring_rule_id, occurrence_date)` … 繰返しの同じ回を2度作らない
  - `UNIQUE (organization_id, dedupe_key)` … CSV明細の再取込を防ぐ
- `balance_snapshots`：`UNIQUE (bank_account_id, as_of_date)`
- `organization_members`：最後のオーナーは削除・降格できない（トリガー）
- `import_jobs`：`UNIQUE (organization_id, file_hash) WHERE status='committed'` … 同じファイルの再取込を防ぐ

### 権限とRLS

| テーブル | 閲覧 | 追加・変更・削除 |
|---|---|---|
| organizations | メンバー | オーナー（作成は `create_organization()` 関数経由） |
| organization_members | メンバー | オーナー（`add_member_by_email()` 関数経由） |
| branches / bank_accounts / balance_snapshots / cash_transactions / recurring_rules / import_* / forecast_scenarios / alert_rules / alerts | メンバー | オーナー・経理担当 |
| audit_logs | オーナー・経理担当 | なし（トリガーのみが書き込む） |

`app.is_member(org)`・`app.has_role(org, roles[])` を `SECURITY DEFINER`・`search_path` 固定で定義し、全ポリシーから使う。

---

## 4. 計算仕様

### 4.1 用語
- **基準残高**：口座ごとの最新の `balance_snapshots`（基準日 D の終業時点の確定残高）
- **確定取引**：`status='confirmed'`。`confirmed_date` に実際に現金が動いたもの
- **予定取引**：`status='planned'`。`certainty='fixed'`（請求済・契約済）と `'expected'`（見込み）を区別
- **取消**：`status='canceled'`。計算に一切含めない

### 4.2 現在の現預金残高（今日 T、Asia/Tokyo）
```
口座の現在残高 = 基準残高(D) + Σ 確定入金(D < confirmed_date ≤ T) − Σ 確定支払(同)
企業全体の現在残高 = Σ（企業の有効な口座の現在残高）   ※口座ごとに1回だけ数える
店舗の現在残高   = Σ（その店舗に属する口座の現在残高）
```
- `confirmed_date ≤ D` の確定取引は基準残高に含まれているとみなし、加算しない（二重計上防止）
- 基準残高のない口座は「残高未登録」として合計から除外し、警告する

### 4.3 二重計上の防止
1. 予定が実際に動いたら **同じ行のステータスを `confirmed` に変える**（別行を作らない）。確定時に金額・日付を実績で上書きし、予定時の値は監査ログに残る
2. 繰返し設定から作る将来の回は**仮想の行**として計算し、同じ `(recurring_rule_id, occurrence_date)` の実データ行（予定・確定・取消すべて）があれば仮想の回は作らない
3. CSV明細は `dedupe_key`（口座・日付・金額・向き・摘要の正規化ハッシュ＋同日同額の連番）で再取込を拒否。予定と一致する明細は「予定を確定にする」候補として提示する（フェーズ3）

### 4.4 口座間振替
- 同じ `transfer_group_id` の出金（振替元）と入金（振替先）で表す
- 口座ごとの残高にはそれぞれ反映する
- **企業全体の入金合計・支払合計には含めない**（企業全体の残高は変わらない）
- 店舗表示では、店舗の外の口座との振替は入出金として表示する（店舗の資金は動くため）

### 4.5 日別予測残高
```
予測残高(T)   = 現在残高
予測残高(d)   = 予測残高(d−1) + 予定入金(d) − 予定支払(d)    （d = T+1 … T+N）
```
- 予定日が今日以前で未確定のもの（期日超過）は、支払は**明日**に計上、入金はシナリオの扱い（下表）に従う
- 繰返しの回の日付：月末指定（31日など）はその月の末日に丸める（2月は28日／閏年29日）。土日の場合は設定に応じて前営業日・翌営業日へずらす（祝日は今後対応）
- 消費税等は**実際に動く現金の額（税込）**で入力・計算する。税金・社会保険は納付日に支払として計上
- 借入：`loan_proceeds`（借入入金）、`loan_principal`（元本返済）、`loan_interest`（利息）を別カテゴリにする

### 4.6 シナリオ（仮定は画面に明示）

| | 保守 | 標準 | 楽観 |
|---|---|---|---|
| 確定予定の入金（請求済など） | 7日遅れ | 予定日 | 予定日 |
| 見込みの入金（売上見込みなど） | 0%（含めない） | 80% | 100% |
| 期日超過の未入金 | 含めない | 7日後に入金 | 明日入金 |
| 支払予定 | 100%（見込みは110%） | 100% | 100% |

- 将来の売上見込みを自動で「確定入金」扱いにしない（必ず `expected`）
- 予測値と実績値は別の系列としてグラフ・表に出す
- フェーズ2のダッシュボードは「標準」で表示し、保守の資金不足予測日も併記する。シナリオの編集・感度分析はフェーズ3

### 4.7 判定
- **資金不足予測日**：予測残高 < 0 になる最初の日
- **最低必要残高割れ**：予測残高 < 最低必要残高（企業設定、または口座ごとの合計）になる最初の日と、その差額
- **支払集中**：1日の支払予定が現在残高の30%以上、または上位の大口支払（フェーズ3）
- **未更新データ**：口座の基準残高の日付が `stale_after_days`（既定7日）より古い／残高未登録

### 4.8 感度分析（フェーズ3）
入金遅延（+7/+14/+30日）、大口支払の増加（+10%/+20%）を与えたときの最小残高と資金不足予測日の変化。

---

## 5. 開発タスク

### フェーズ1：調査・設計（本書）
- [x] リポジトリ調査、要件整理、DB設計、画面設計、計算仕様

### フェーズ2：MVP（今回）
- [x] Next.js プロジェクト（`ait-cashflow/`）、UI部品、日本語・円・Asia/Tokyo
- [x] DBマイグレーション（全13テーブル・制約・インデックス・RLS・監査トリガー・企業作成/メンバー追加関数）
- [x] RLSテスト（PGlite上で他企業データへのアクセス拒否・権限ごとの書き込み可否）
- [x] 認証（Supabase：サインアップ・メール確認・ログイン・ログアウト）、未ログイン時のリダイレクト
- [x] 企業作成・店舗・口座・残高（基準残高）登録・メンバー追加と権限
- [x] 取引の手入力・確定・取消・振替・繰返し設定
- [x] 資金計算エンジン（現在残高・日別予測・3シナリオ・判定）とテスト
- [x] ダッシュボード（店舗切替・グラフ・警告）
- [x] デモモード（Supabase未設定時のみ・常時「デモデータ」表示）

### フェーズ3
- [ ] CSV取込（UTF-8/Shift_JIS判定、列マッピング、プレビュー、重複検知、予定との突合、エラーレポート、監査）
- [ ] 資金予測画面（シナリオ編集、180日、感度分析）、カレンダー
- [ ] アラート（生成ジョブ、重複抑制、既読管理）

### フェーズ4
- [ ] AI分析（同意取得、データ最小化、要約・下書き、送信なし）、E2Eテスト、デプロイ手順

### フェーズ5
- [ ] 会計ソフト・銀行API連携の設計（実装は別途承認）

---

## 6. セキュリティ上の注意点

| リスク | 対策 |
|---|---|
| 他企業のデータの閲覧・改ざん | 全テーブルRLS。複合外部キーで他社IDの参照を禁止。アプリ側でもメンバーシップを確認。RLSテストで検証 |
| 権限昇格 | 役割の変更・メンバー追加はオーナーのみ（RLS＋関数内チェック）。最後のオーナーの削除禁止 |
| サービスロールキーの漏えい | アプリでは使わない（anon key＋利用者のJWTのみ）。シークレットは環境変数、`.env.example` のみコミット |
| 認証の回避 | `proxy.ts` とページ・Server Action の両方でセッション確認。デモモードは本番では既定で無効 |
| 入力の不正 | 全入力を Zod で検証（金額は正の整数・上限、日付は実在日、文字数上限） |
| 大量リクエスト | Server Action ごとにユーザー単位のレート制限（MVPはメモリ上。複数台構成ではRedis等に置換） |
| ログへの機密出力 | 口座番号は下4桁のみ保存。エラーログに金額・取引先・トークンを出さない。監査ログはDB内のみ |
| CSVの数式インジェクション | 取込時に `= + - @ \t \r` で始まるテキストを無害化して保存。将来のCSV出力でも先頭に `'` を付ける |
| CSRF / クリックジャッキング | Server Actions の Origin 検証（Next.js標準）、`X-Frame-Options: DENY`、`SameSite=Lax` Cookie |
| AIへの情報送信（フェーズ4） | 利用者の同意、個人名・口座番号を除いた集計値のみ送信、APIキーはサーバー側のみ、自動送金・自動送信はしない |

### バックアップと復元方針
README に記載（Supabaseの日次バックアップ／PITR、`pg_dump` による手動バックアップ、復元手順、復元後の確認項目）。
