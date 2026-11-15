# あんど整骨院グループ 社内ルール・マニュアル（manual/）

設計：[../docs/manual-system/](../docs/manual-system/)。今回は **MVP-1**（ログイン・役職と所属・ルールの承認フロー・閲覧・確認済み・検索・原文の取り込み・監査ログ）。

## しくみ

| 部分 | 内容 |
|---|---|
| 画面・サーバー | Next.js（App Router）＋ TypeScript ＋ Tailwind CSS。Vercel の別プロジェクト |
| DB | 予約管理と同じ Supabase。テーブルは `mn_` から始まる（`../sql/2026-11-15_manual_system.sql`） |
| ログイン | スタッフ：予約管理と同じ「院ID＋院PASS＋個人PASS」（`../lib/` をそのまま使用）。院長・BM・GM・社長：予約管理と同じメールアドレス（Supabase Auth） |
| 権限 | すべてサーバー側で判定（`src/lib/authz.ts`）。院ID＋個人PASSのログインでは、承認・編集の力は使えない |
| 守り | `mn_` テーブルは RLS を有効にしてポリシーなし（ブラウザのキーでは読めない）。監査ログ・承認の記録・確認済み・原文はトリガーで書き換え・削除不可。公開は「社長承認待ち」からだけ、矛盾が未解決なら公開不可（DB でも確認） |
| 原文 | リポジトリが公開されているため、原文はリポジトリに置かない。管理者が画面から Googleドキュメントの書き出し（.txt）を取り込み、DB にだけ保存する |

## 初回の準備

1. Supabase の SQL Editor で `../sql/2026-11-15_manual_system.sql` を実行（何度実行しても同じ結果）
2. Vercel で **Add New → Project** → このリポジトリ → **Root Directory = `manual`**（Framework は Next.js）。「Include files outside the root directory」は **ON**（`../lib` を使うため）
3. Environment Variables
   | 名前 | 値 |
   |---|---|
   | `DATABASE_URL` | Supabase → Connect → **Transaction pooler** の URI（パスワード入り。秘密） |
   | `MANUAL_SESSION_SECRET` | 32文字以上のランダムな文字列（秘密。`openssl rand -base64 48`） |
   | `SUPABASE_ANON_KEY` | 予約管理と同じ anon キー |
   | `SUPABASE_SERVICE_ROLE_KEY` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `PIN_SESSION_SECRET` | 予約管理のプロジェクトと同じ値 |
   | （設定している場合）`SALES_SHEET_ID` / `CAREER_SHEET_ID` | 予約管理と同じ値 |
4. Deploy
5. 社長がメールアドレスでログイン → **管理者設定**
   1. 自分に「社長」の所属を追加（社長が未登録の間だけ、管理者が最初の設定をできる）
   2. 「台帳から取り込む」→ スタッフと所属が作られる（台帳の役職から 院長／副院長／チーフ／スタッフ）
   3. GM・BM の所属と担当エリアを設定
   4. 「原文の取り込み」で Googleドキュメントの .txt を取り込む
6. GM：「承認・提案」で GM確認 → 社長：承認して公開

## 開発

```bash
npm install
npm test          # 権限・原文の分解・DB（PGlite で本物の SQL とトリガーを実行）
npm run build
```

手元で画面を動かすとき：`DATABASE_URL=postgres://…@127.0.0.1:…` と `MANUAL_DEV_LOGIN=1` で `npm run dev`。ログイン画面に開発用ログインが出る（本番・Vercel では出ない）。
実際の原文での分解の確認：`MANUAL_SOURCE_TXT=/path/to/export.txt npx vitest run test/importer-real.test.ts`
