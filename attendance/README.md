# あんど整骨院グループ 統合勤怠管理システム Ver.2.0

全7院（枚方本院・田口山院・津田院・交野院・茨木院・大和田院・香里園院）の勤怠・シフト・休暇を一元管理する Web アプリです。
設計書：[docs/DESIGN.md](docs/DESIGN.md)

## 実装状況

| フェーズ | 内容 | 状態 |
|---|---|---|
| 1 | プロジェクト作成・認証・店舗/スタッフマスタ・権限管理（RLS） | ✅ 実装済み |
| 2 | 院長向けシフト作成・確定・編集 | 未着手 |
| 3 | 共用端末打刻・勤怠実績 | 未着手（`/kiosk` は枠のみ） |
| 4 | 有給・祝日勤務休日の台帳 | 未着手 |
| 5 | 本部統合ダッシュボード・承認 | 未着手 |
| 6 | 月次締め・CSV/Excel 出力・運用マニュアル | 未着手 |

### フェーズ1で使える画面

| パス | 利用者 | 内容 |
|---|---|---|
| `/login` | 全員 | ログイン |
| `/hq` | 本部 | 本部ホーム（院別スタッフ数） |
| `/manager` | 院長・本部 | 院ホーム（担当院のスタッフ一覧。兼務は複数院） |
| `/admin/clinics` | 本部 | 店舗マスタ（追加・院名変更・休止・閉鎖） |
| `/admin/staff` | 本部 | スタッフ一覧・登録・詳細（個人情報・異動・応援） |
| `/admin/users` | 本部 | 管理画面アカウント・ロール付与（院長は院単位）・パスワード再設定・停止 |
| `/me` | 全員 | マイページ |
| `/kiosk` | 共用端末 | 打刻端末の入口（フェーズ3で実装） |

## 技術構成

Next.js（App Router）/ TypeScript / Tailwind CSS / Supabase（Auth・PostgreSQL・RLS）/ Zod / Vitest / Playwright

権限は **画面・Server Action・DB（RLS）の三層** で判定します。最終的な防御は DB の RLS で、
判定ルールは `supabase/migrations/*_rls_helpers.sql` と `*_rls_policies.sql` にあります。

## セットアップ

### 1. Supabase プロジェクト

予約システムとは**別の Supabase プロジェクト**を作成してください（労務データを分離するため）。

```bash
# Supabase CLI でマイグレーションを適用
supabase init        # supabase/config.toml が無い場合のみ（既存の migrations はそのまま使われます）
supabase link --project-ref <project-ref>
supabase db push
# 初期7院を投入
psql "<接続文字列>" -f supabase/seed.sql
```

### 2. 最初のシステム管理者を作る

1. Supabase ダッシュボード → Authentication → Users → 「Add user」でメール・パスワードを登録（Auto Confirm を ON）
2. SQL Editor で以下を実行（メールアドレスを置き換え）

```sql
insert into public.app_accounts (user_id, email, display_name)
select id, email, 'システム管理者' from auth.users where email = 'admin@example.com';

insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'admin@example.com';
```

以降のアカウント（本部事務・院長）は画面の「アカウント・権限」から作成できます。

### 3. 環境変数

`.env.example` を `.env.local` にコピーして設定します。

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon（publishable）キー |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（**サーバー専用**。アカウント作成・パスワード再設定に使用） |

### 4. 起動

```bash
npm install
npm run dev
```

### Vercel へのデプロイ

既存サイトとは別の Vercel プロジェクトを作成し、**Root Directory を `attendance`** にして、上記の環境変数を設定します。

## テスト

```bash
npm run lint      # 型チェック
npm test          # ユニットテスト（権限判定・日付・入力検証）
npm run test:db   # DB / RLS テスト（PostgreSQL が必要）
npm run test:e2e  # E2E（Playwright。事前に npm run build）
```

### DB テスト

素の PostgreSQL 15 以上に対して、Supabase 互換の前提（`tests/db/supabase-shim.sql`）→ マイグレーション → seed を適用し、
`authenticated` ロール＋JWT を再現して RLS を検証します。各テストはトランザクション内で実行し、最後にロールバックします。

接続先は `TEST_DATABASE_URL`（既定 `postgres://postgres@127.0.0.1:54329/postgres`）。テスト実行時に `attendance_test` データベースを作り直します。

```bash
# 例：Docker で PostgreSQL を起動
docker run -d --name attendance-pg -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
npm run test:db
```

主な検証内容（フェーズ1）：

- **必須テスト17**：院長は他院スタッフの個人情報を取得できない（応援登録スタッフも氏名・IDのみ）
- 院長兼務・異動・期限切れロール・停止アカウントの扱い
- 院長・スタッフはマスタを変更できない／本部は変更でき監査ログが残る
- 店舗名変更後も店舗IDと履歴が維持され、店舗・スタッフは物理削除できない
- 本部事務は本部・管理者ロールを付与・停止できない
- 監査ログは追記専用

### E2E テスト

既定では Supabase なしで、未ログイン時の保護とキオスク画面の分離を検証します。
`E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` と `E2E_HQ_EMAIL` / `E2E_HQ_PASSWORD` / `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD`
を設定すると、実際のログインを伴うテストも実行します。
