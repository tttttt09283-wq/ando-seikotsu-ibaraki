# AND GROUP MANAGEMENT SYSTEM（management/）

あんど整骨院グループの社内業務管理アプリ。設計は [../docs](../docs/requirements.md)。

**現在：PHASE 3（休暇残数・CSV移行）まで。本番のデータベース・公開・実データ登録は未実施（承認後に行う）。**

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

## 本番に適用する手順（**承認をいただいてから実施**）

1. Supabase（既存プロジェクト）の SQL エディタで `supabase/migrations/*.sql` を順に実行し、`supabase/seed/0001_master.sql` を実行
2. Supabase の設定 → API → **Exposed schemas に `mgmt` を追加**（追加しないと画面からデータを読めない）
3. 社長のアカウントを用意し、`mgmt.users` と `mgmt.user_roles`（PRESIDENT）を SQL で1件だけ登録（以降は画面から登録）
4. Vercel に新しいプロジェクトを作り、Root Directory を `management` にする。環境変数：`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`・`LOGIN_ID_DOMAIN`
5. 既存サイト（リポジトリ直下）は `.vercelignore` で `management/` と `docs/` を公開しない。新しいプロジェクトのデプロイで `management/` が除外されていないことを確認する
