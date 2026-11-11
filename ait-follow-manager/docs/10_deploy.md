# 10. デプロイ手順・運用

> **本番環境へのデプロイ・有料プランの契約・実データの投入は、必ず事前に承認を得てから行います。**
> ここに書いた手順は、承認後に実施する内容です（2026-11-11 時点で未実施）。

## 1. 環境の分離

| 環境 | Supabase | Vercel | データ |
|---|---|---|---|
| ローカル開発 | `supabase start`（Docker、無料） | `npm run dev` | 架空シードのみ |
| 開発（任意） | 開発用プロジェクト（Free） | Preview デプロイ | 架空データのみ |
| 本番 | 本番用プロジェクト（Pro 推奨：日次バックアップ） | Production | 承認後に実データ |

本番の `SUPABASE_SERVICE_ROLE_KEY` は Vercel の **Production 環境変数にのみ**設定し、Preview・Development には設定しない。

## 2. ローカル開発（無料で完結）

必要：Node.js 22、Docker

```bash
cd ait-follow-manager
npm ci
npm run db:start          # ローカル Supabase 起動（初回はイメージ取得に数分）
npx supabase status -o env  # API_URL / ANON_KEY / SERVICE_ROLE_KEY を確認
cp .env.example .env.local  # 上記の値を設定。ローカルでは REQUIRE_ADMIN_MFA=false でも可
npm run db:reset          # マイグレーション＋架空シード
npm run dev               # http://localhost:3000
```

デモアカウント（パスワード `DemoPass1234`）：
`admin@example.com`（組織管理者）/ `manager@example.com`（本店 店舗責任者）/ `staff@example.com`（本店 スタッフ）/
`staff2@example.com`（駅前店 スタッフ）/ `other-admin@example.com`（別組織）/ `platform@example.com`（運営管理）

招待・再設定メールはローカルの Mailpit（http://127.0.0.1:54324）に届く。

## 3. 本番構築（承認後）

1. **Supabase プロジェクト作成**（リージョン：Tokyo `ap-northeast-1`）
2. マイグレーション適用：`npx supabase link --project-ref <ref>` → `npx supabase db push`（**seed.sql は本番に投入しない**）
3. Auth 設定（ダッシュボード）
   - Site URL：本番 URL、Redirect URLs：`https://<本番ドメイン>/**`
   - サインアップ無効（招待のみ）、最小パスワード長 10・英大小文字＋数字、漏洩パスワード検出 ON
   - MFA（TOTP）有効
   - メールテンプレート（招待・パスワード再設定）を `supabase/templates/*.html` の内容に変更（`token_hash` 方式のリンク）
   - SMTP：独自 SMTP を設定（Supabase 標準の送信は回数制限が厳しいため）
4. **Vercel プロジェクト作成**：Root Directory を `ait-follow-manager` に設定
5. 環境変数（Production）：`.env.example` の全項目。`APP_ENV=production`、`REQUIRE_ADMIN_MFA=true`、`SITE_URL=https://...`、`CRON_SECRET` はランダム値
6. Cron：`vercel.json` の `/api/cron/generate-tasks`（毎日 21:00 UTC＝6:00 JST）。Vercel が `Authorization: Bearer $CRON_SECRET` を付与
7. 最初の運営管理者を SQL で登録：`insert into platform_admins (user_id) values ('<auth user id>');`
8. 運営管理画面から組織を作成 → 組織管理者を招待

## 4. バックアップ
- Supabase Pro の日次自動バックアップ（7日保持）
- 追加で週1回 `supabase db dump --data-only` を暗号化して別ストレージへ保存（手順は試験運用前に確定）
- 復元手順の訓練を試験運用前に1回実施

## 5. 運用時の確認事項
- 監査ログ（設定 → 監査ログ）を月次で確認
- Supabase の Security Advisor で RLS 警告がないこと
- 依存パッケージの更新（`npm audit`）を月次で確認
- 解約組織のデータは解約後90日で削除（01 Q20）
