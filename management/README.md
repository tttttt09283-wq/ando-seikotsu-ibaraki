# AND GROUP MANAGEMENT SYSTEM（management/）

あんど整骨院グループの社内業務管理アプリ。設計は [../docs](../docs/requirements.md)。

**現在：PHASE 2（認証・権限・店舗管理）まで。本番のデータベース・公開・実データ登録は未実施（承認後に行う）。**

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

ダッシュボードの中身（承認待ち・KPIなど）は PHASE 4〜9 で作る（画面に「追加予定」と表示）。

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
npm test            # 単体テスト（ログインID・PASS発行・役職・入力確認・日本時間）
npm run test:db     # DBテスト：ローカルの PostgreSQL 16 を一時的に起動し、RLS・権限・監査ログを検証
```

`test:db` は `/usr/lib/postgresql/16/bin` の PostgreSQL を使う（`PG_BIN` で変更可）。Supabase の `auth` スキーマとロールは `supabase/tests/supabase-stub.sql` で再現している（本番には適用しない）。

## 本番に適用する手順（**承認をいただいてから実施**）

1. Supabase（既存プロジェクト）の SQL エディタで `supabase/migrations/*.sql` を順に実行し、`supabase/seed/0001_master.sql` を実行
2. Supabase の設定 → API → **Exposed schemas に `mgmt` を追加**（追加しないと画面からデータを読めない）
3. 社長のアカウントを用意し、`mgmt.users` と `mgmt.user_roles`（PRESIDENT）を SQL で1件だけ登録（以降は画面から登録）
4. Vercel に新しいプロジェクトを作り、Root Directory を `management` にする。環境変数：`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY`・`LOGIN_ID_DOMAIN`
5. 既存サイト（リポジトリ直下）は `.vercelignore` で `management/` と `docs/` を公開しない。新しいプロジェクトのデプロイで `management/` が除外されていないことを確認する
