# AND GROUP MANAGEMENT SYSTEM（management/）

あんど整骨院グループの社内業務管理アプリ。設計は [../docs](../docs/requirements.md)。

**現在：PHASE 10（総合テスト・セキュリティ検証・導入手順）まで完了。本番への反映は承認待ち（手順：[docs/rollout.md](../docs/rollout.md)、結果：[docs/test-results.md](../docs/test-results.md)）。本番のデータベース・公開・実データ登録は未実施（承認後に行う）。**

## できること（PHASE 2）

| 画面 | 内容 |
|---|---|
| `/login` | ログインID＋PASS（POSと同じ方式：`tanaka` → `tanaka@ando.jp`） |
| `/account/password` | PASSの変更（発行されたPASSで初めて入ったときは必須） |
| `/` | 役職に合わせて振り分け（社長→`/president`、GM→`/gm`、BM→`/area`、院長→`/store/[id]`、スタッフ→`/me`） |
| `/admin/users` | スタッフ一覧（店舗で絞り込み・退職者表示） |
| `/admin/users/new` | スタッフ登録＋ID/PASS発行（POSで使っているIDなら既存アカウントに紐づけ） |
| `/admin/users/[id]` | プロフィール、店舗の所属・役職（兼務・異動）、社長・GM・BM、PASS再発行、退職（ログイン停止） |
| `/admin/stores` | 店舗（7院）・エリアの管理、POSの店舗番号の紐づけ |

## できること（PHASE 3）

| 画面 | 内容 |
|---|---|
| `/me` | 自分の有給（現在残数・取得予定反映後・予定・申請中・次の失効）、振休（振替・祝振替と合計、期限切れの警告）、年5日の進み具合 |
| `/staff/[id]/leave` | 付与ごとの明細（付与日・有効期限・残り・状態）、取得の履歴、修正の記録。社長は残数の修正（理由必須）、院長・社長は振休の発生（出勤した日）を登録 |
| `/store/[id]` | 院長：スタッフ別の残数、期限切れの振休・年5日のアラート |
| `/admin/leave` | 社長：入社日基準の有給の付与予定（前後60日）。出勤率8割以上を確認して付与 |
| `/admin/import` | 社長：スタッフCSV・残数CSV（付与ごとに1行）のアップロード → 全行の検証 → 取り込み／取り消し。UTF-8・Shift_JIS（Excel）に対応。ひな形をダウンロード可 |

残数は DB 関数 `mgmt.leave_balance()`・`mgmt.five_day_status()` で、付与・取得・調整の記録から毎回計算する（直接書き換えない）。
有給の申請・承認（PHASE 4）以降の画面には「追加予定」と表示している。

## できること（PHASE 4）

| 画面 | 内容 |
|---|---|
| `/leave/new` | 有給・振休の申請（日付を1日ずつ追加、残数をその場で表示、残数不足は例外確認の理由が必須）。院長は自院スタッフの有給を代理申請 |
| `/leave`・`/leave/[id]` | 申請の一覧・詳細（承認の履歴）、取下げ、差戻し後の再申請、承認済みの取消（理由必須・残数を戻す） |
| `/approvals` | 承認待ち：社長＝有給、院長＝自院の振休。承認・差戻し・却下（理由必須。有給の却下は理由の区分も必須） |
| `/notifications` | アプリ内通知（承認依頼・結果・院長本人の振休の本人承認） |

承認は DB 関数 `mgmt.decide_leave_step()` が 権限・自己承認（院長本人の振休だけ例外）・順序・バージョン・冪等キー を確認し、残数の割り当てまで1つのトランザクションで行う。

## できること（PHASE 5）

| 画面 | 内容 |
|---|---|
| `/part-time/new` | 院長：アルバイト勤務の申請（計画／緊急ヘルプ／繁忙時間帯、日時・休憩・理由）。勤務する人は「未定」で申請し、あとから設定できる（Q-8） |
| `/part-time`・`/part-time/[id]` | 申請の一覧・詳細・履歴。勤務者の設定・変更、差戻し後の再申請、取下げ、取消 |
| `/approvals` | 社長：アルバイト勤務の承認（緊急を先頭に表示） |
| `/admin/stores` | 運用設定：シフト確定の基準日（初期値：前月20日。Q-20） |

勤務する月の前月20日を過ぎた申請は「例外申請」（理由必須）。判定は DB 関数 `mgmt.shift_cutoff_for()`。

## できること（PHASE 6）

| 画面 | 内容 |
|---|---|
| `/holiday-change/new` | 院長：承認済みの振休（まだ先の日）を選び、アルバイトとしての勤務時間・理由を入力して申請 |
| `/holiday-change`・`/holiday-change/[id]` | 申請の一覧・詳細（GM確認 → 社長承認の進み具合）・履歴。差戻し後の再申請（GMの確認から）、取下げ |
| `/approvals`・`/gm`・`/president` | GM：事前確認。社長：GM確認済みの最終承認（GMの確認前は DB が拒否） |

確定すると、その振休は「勤務に変更（消費）」（`leave_usage.status = 'converted'`）になり、残数には戻らない（Q-8）。変更済みの日を含む振休の申請は取り消せない。

## できること（PHASE 7）

| 画面 | 内容 |
|---|---|
| `/meetings`・`/meetings/new` | 会議の一覧（提出が必要／開催予定／提出済み）と登録。POSで登録した会議も表示（POSの `public.meetings` を拡張して共用） |
| `/meetings/[id]` | 議事録の下書き保存・正式提出・提出後の修正（版を保存）。参加者・議題・内容・決定事項（担当者・実施期限・具体的な行動）が必須。「決定事項なし」は明示 |
| `/tasks` | 自分のタスク（会議の決定事項を含む）の進み具合の更新。院長は院のタスクを登録・削除 |
| `/president`・`/gm`・`/store/[id]` | 議事録の提出待ち・期限超過、院のタスク |

提出期限は開催日の3日後の 23:59:59（日本時間）。DB関数 `mgmt.minutes_due_at()`・`mgmt.minutes_is_late()` で一元計算。期限の前日・当日・超過の通知は `mgmt.run_minutes_reminders()`（PHASE 9 で毎日 9:00 に実行）。検証環境には POS のテーブルがないため、`supabase/tests/pos-stub.sql` で同じ形の表を作ってから適用する（本番には適用しない）。

## できること（PHASE 8）

| 画面 | 内容 |
|---|---|
| `/rules`・`/rules/[no]` | 規定の一覧・閲覧・「確認しました」（版ごとに記録）・改定履歴（旧版の本文） |
| `/rules/new`・`/rules/[no]/edit` | 社長・GM：新しい規定・改定案の編集（公開中の版との差分）→ 社長に承認を依頼 |
| `/approvals`・`/president` | 社長：規定の承認・差戻し → 公開（対象者に通知し、確認をやり直してもらう） |
| `/me` | 自分が未確認の規定 |

初期規定 001〜005 は `supabase/seed/0002_rules.sql` で「初期案（下書き）」として登録する。初期案は「施行済み」と表示しない。社長本人の改定案は社長が承認でき、「本人承認」の印を残してGMに通知する（2026-11-11 決定）。

## できること（PHASE 9）

| 画面・処理 | 内容 |
|---|---|
| `/gm`・`/president`・`/area` | 院×KPI の表（議事録提出率・期限内提出率・期限超過・決定事項の実行率・アルバイト申請・社長承認待ち・有給取得率（暫定）・年5日未達見込み・振休の残りと期限切れ・残数不足の申請・規定未確認）。月の切り替え、数値から一覧へ。BMは担当エリアの院だけ |
| `/president` | 先頭に承認待ちの合計（緊急の件数）、毎日の自動処理の実行結果 |
| `/me` | 自分のタスク（期限切れを赤で表示） |
| `/api/cron/daily` | 毎日 9:00 JST（`vercel.json` の Cron）。取得済みの反映・議事録期限・有給の期限接近（60日）・期限切れの振休・タスクの期限・月曜は年5日。`CRON_SECRET` で呼び出し元を確かめ、サービスロールで `mgmt.run_daily_jobs()` を呼ぶ |

本番では Vercel の環境変数に `CRON_SECRET`（長いランダムな文字列）と `SUPABASE_SERVICE_ROLE_KEY` を設定する。

## PHASE 10 で追加したもの

- セキュリティ・POSとの共用・性能の自動テスト（`supabase/tests/security.test.mjs`）、本番の戻し方の確認（`rollback.test.mjs`）
- 承認・規定の公開・残数の修正・CSV取り込み・ID/PASSの発行の前の**再ログイン**（最後のログインから12時間。`REAUTH_HOURS`）
- 院長の退職・異動で承認する人がいなくなった振休を社長・GMに通知（「承認者不在」）
- 本番用の SQL（`supabase/production/`：POS の店舗の紐づけ・最初の社長の登録のひな形・戻し方）
- 導入手順 `docs/rollout.md`、受け入れテスト `docs/acceptance-checklist.md`、テスト結果 `docs/test-results.md`

## 構成

- Next.js 16（App Router・`proxy.ts`）／TypeScript／Tailwind CSS 4／shadcn/ui 方式の部品（`components/ui`）
- Supabase（既存プロジェクト）の **専用スキーマ `mgmt`**。テーブル・RLS・権限判定は `supabase/migrations`
- 権限の判定は DB 関数 `mgmt.can(権限, 店舗)`。画面・サーバー処理・RLS で同じ判定を使う
- サービスロールキーは ID/PASS の発行・再発行・ログイン停止だけに使う（`lib/supabase/admin.ts`、サーバー専用）

## 開発

```bash
cd management
npm install
cp .env.example .env.local   # 値を入れる（検証用のプロジェクトのみ）
npm run dev
```

## テスト

```bash
npm run typecheck   # 型チェック
npm test            # 単体テスト（ログインID・PASS発行・役職・入力確認・日本時間・CSV・法定付与日数・CSV検証）
npm run test:db     # DBテスト：ローカルの PostgreSQL 16 を一時的に起動し、RLS・権限・監査ログ・残数計算・年5日・CSV取り込みを検証
```

`test:db` は `/usr/lib/postgresql/16/bin` の PostgreSQL を使う（`PG_BIN` で変更可）。Supabase の `auth` スキーマとロールは `supabase/tests/supabase-stub.sql` で再現している（本番には適用しない）。

## 検証環境（ダミーデータのみ）

- Supabase の検証用プロジェクト `and-group-management-verify`（無料・東京）に、マイグレーションと初期マスタを適用済み。
- Exposed schemas への `mgmt` の追加は、SQL（`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, mgmt'` と `notify pgrst, 'reload config'`）で行った。本番では Supabase の設定画面（API → Exposed schemas）で行う。
- ダミーの利用者7名（ログインIDは `t-` で始まる）で、ログイン・PASS変更の強制・院長の権限範囲・振休の登録、PHASE 4 の申請→承認（社長の有給承認、院長の振休承認、院長本人の振休の本人承認とGMへの通知）、PHASE 5 のアルバイト勤務（基準日後の例外申請、緊急の優先表示、社長の承認、承認後の勤務者の設定と通知）、PHASE 9 のダッシュボード（GM・社長の院×KPIの表、月の切り替え、数値から一覧へ、院長はGM・エリアの画面を開けない、スマホ幅で画面がはみ出さない）と毎日の処理（年5日の通知、2回目は通知なし、合言葉のない呼び出しは拒否）、PHASE 8 の規定（公開前はスタッフに見えない、GMの初期案→社長の承認→公開→スタッフに通知・未確認の表示→確認、社長本人の改定案は本人承認でGMに通知、第2版の公開で確認のやり直し、旧版の閲覧）、PHASE 7 の会議（移行前の会議は対象外、会議の登録→下書き→必須項目の不足でエラー（入力は残る）→提出、決定事項が担当者のタスク・通知に出る、進み具合の更新、期限超過の表示と通知、他院の院長は見られない）、PHASE 6 の振休→アルバイト勤務（GM確認前は社長が承認できない、GM確認→社長承認で確定、振休が消費され残数に戻らない、候補から外れる）を確認済み。
- この環境で Node のサーバーから外部に出るには `NODE_USE_ENV_PROXY=1` が必要（開発用サンドボックスの事情。本番の Vercel では不要）。

## 本番に適用する手順（**承認をいただいてから実施**）

1. Supabase（既存プロジェクト）の SQL エディタで `supabase/migrations/*.sql` を順に実行し、`supabase/seed/0001_master.sql` を実行
2. Supabase の設定 → API → **Exposed schemas に `mgmt` を追加**（追加しないと画面からデータを読めない）
3. 社長のアカウントを用意し、`mgmt.users` と `mgmt.user_roles`（PRESIDENT）を SQL で1件だけ登録（以降は画面から登録）
4. Vercel に新しいプロジェクトを作り、Root Directory を `management` にする。環境変数：`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`・`LOGIN_ID_DOMAIN`
5. 既存サイト（リポジトリ直下）は `.vercelignore` で `management/` と `docs/` を公開しない。新しいプロジェクトのデプロイで `management/` が除外されていないことを確認する
