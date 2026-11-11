# 05. マルチテナント・権限設計書

## 1. 基本方針：二重防御

1. **RLS（データベース）**：たとえアプリのバグがあっても、他組織の行は SQL で取得・更新できない
2. **サーバー側認可（アプリ）**：Server Action / Route Handler の冒頭で必ず `authorize()` を実行し、
   ロール・店舗スコープを検証してから処理する。エラーメッセージで他組織データの存在を推測させない（404 を返す）

ブラウザからは **anon キー＋ユーザーのセッション**のみ使用。`service_role` キーはサーバー専用で、
使用箇所を「日次タスク抽出ジョブ」「招待処理」「Platform Admin の組織作成」に限定し、コードレビュー対象とする。

## 2. ロール

| ロール | 所属単位 | 概要 |
|---|---|---|
| Platform Admin | なし（`platform_admins` 表） | A.I.T company 運営者。組織の作成・停止・Org Admin 招待。**顧客情報は閲覧不可** |
| Organization Admin | 組織 | 組織全体の設定・全店舗のデータ・スタッフ管理 |
| Store Manager | 店舗（複数可） | 担当店舗のデータ・スタッフ・ルール・テンプレート管理 |
| Staff | 店舗（複数可） | 担当店舗の顧客閲覧・登録・編集、タスク対応 |

## 3. 権限マトリクス

○＝可　△＝自店舗のみ　□＝自分の担当分のみ（組織設定で「担当顧客のみ」選択時）　×＝不可

| 操作 | Platform | Org Admin | Store Mgr | Staff |
|---|---|---|---|---|
| 組織の作成・停止 | ○ | × | × | × |
| 会社情報の編集 | × | ○ | × | × |
| 店舗の作成・削除 | × | ○ | × | × |
| 店舗情報の編集 | × | ○ | △ | × |
| スタッフ招待・無効化 | Org Adminのみ招待 | ○ | △（Staffのみ） | × |
| ロール変更 | × | ○ | × | × |
| 顧客の閲覧 | × | ○ | △ | △／□ |
| 顧客の登録・編集 | × | ○ | △ | △／□ |
| 顧客の削除（匿名化） | × | ○ | × | × |
| 顧客のエクスポート | × | ○ | × | × |
| CSV 取込 | × | ○ | △ | × |
| 連絡同意・配信停止の記録 | × | ○ | △ | △ |
| 来店・予約の記録 | × | ○ | △ | △ |
| タスクの閲覧・対応記録 | × | ○ | △ | △ |
| タスクの担当者変更 | × | ○ | △ | 自分を担当にする のみ |
| タスクを「対象外」にする | × | ○ | △ | ○（理由必須） |
| フォロールールの編集 | × | ○（全体ルール） | △（店舗ルール） | × |
| 今すぐ抽出の実行 | × | ○ | △ | × |
| テンプレートの閲覧・コピー | × | ○ | ○ | ○ |
| テンプレートの作成・編集 | × | ○（全体） | △（店舗用） | × |
| 分析の閲覧 | 件数集計のみ | ○ | △ | × |
| 監査ログの閲覧 | Platform操作のみ | ○ | × | × |

Phase 1 ではロールは固定（カスタムロールなし）。権限表は `lib/auth/permissions.ts` に**単一の定義**として持ち、
サーバー認可・UI 表示制御・テストの全てがこの定義を参照する。

## 4. RLS 設計

### 4.1 ヘルパー関数（`app` スキーマ、`security definer`、`stable`、`search_path` 固定）

```sql
-- 自分が所属する組織（active な membership のみ、かつ組織が active）
app.user_org_ids() returns setof uuid
-- 指定組織で指定ロールのいずれかを持つか
app.has_org_role(org uuid, roles text[]) returns boolean
-- 指定店舗にアクセスできるか（org_admin は組織内全店舗、それ以外は所属店舗）
app.can_access_store(org uuid, store uuid) returns boolean
-- 指定店舗で管理権限（org_admin または当該店舗の store_manager）を持つか
app.can_manage_store(org uuid, store uuid) returns boolean
-- 顧客を閲覧できるか（Staff の閲覧範囲設定を考慮）
app.can_view_customer(org uuid, store uuid, assigned uuid) returns boolean
```

`memberships` 自体の RLS から上記関数を呼ぶと再帰するため、関数は `security definer` で
`memberships` を直接参照し、`memberships` のポリシーは「自分の行」＋「管理者は自組織の行」に限定する。

### 4.2 ポリシー例（customers）

```sql
alter table customers enable row level security;
alter table customers force row level security;

create policy customers_select on customers for select
  using (
    deleted_at is null
    and app.can_view_customer(organization_id, store_id, assigned_staff_id)
  );
-- can_view_customer: can_access_store が真 かつ、
--   組織設定 staff_visibility = 'store'、または当該店舗で store_manager 以上、
--   または assigned_staff_id = auth.uid()
-- （ロールは「店舗ごと」に判定する。A店で Staff・B店で Store Manager の人も正しく扱う）

create policy customers_insert on customers for insert
  with check (app.can_access_store(organization_id, store_id));

create policy customers_update on customers for update
  using (app.can_access_store(organization_id, store_id))
  with check (app.can_access_store(organization_id, store_id));
-- DELETE ポリシーは作らない（削除は匿名化関数経由、org_admin のみ）
```

### 4.3 全テーブルの方針

| テーブル | SELECT | INSERT / UPDATE | DELETE |
|---|---|---|---|
| organizations | 所属組織 | Platform（サービスロール経由）/ 会社情報は org_admin | なし |
| stores | 所属組織の店舗 | org_admin（編集は store_manager も自店舗） | なし（無効化） |
| memberships | 自分の行／管理者は組織内 | 招待関数経由のみ | なし（無効化） |
| customers ほか顧客関連 | `can_access_store` | `can_access_store` | なし |
| followup_rules | 所属組織 | `can_manage_store`（store_id null は org_admin） | なし（無効化） |
| followup_tasks | `can_access_store` | 生成はジョブのみ／更新は `can_access_store` | なし |
| message_templates | 所属組織 | `can_manage_store` | なし（アーカイブ） |
| consent_records / audit_logs | 店舗アクセス／org_admin | INSERT のみ（関数経由） | なし |

全表で `force row level security`。**RLS 未設定のテーブルが存在しないことを CI で検査**する
（`pg_tables` と `pg_class.relrowsecurity` を確認するテスト）。

### 4.4 Platform Admin の扱い

- `platform_admins` に登録されていても memberships を持たないため、顧客関連表は RLS で一切見えない
- 組織一覧・件数は `security definer` 関数 `app.platform_org_summaries()` で**件数のみ**返す（個人情報なし）
- サポート目的のアクセスは Phase 1.5 で「Org Admin による期限付き許可（`support_access_grants`）＋全操作の監査ログ」として実装予定

## 5. サーバー側認可

```ts
// すべての Server Action / Route Handler の冒頭
const ctx = await authorize({
  orgSlug,                     // URL から
  permission: "customer.update",
  storeId: input.storeId,      // 対象店舗（店舗スコープの操作）
});
// ctx = { userId, orgId, roles, storeIds }  —— 失敗時は NotFound/Forbidden を throw
```

- 入力は zod で検証。`organization_id` は**クライアントから受け取らず**、`ctx.orgId` を使う
- 対象行の店舗は DB から取得して検証（クライアント送信の store_id を信用しない）
- 組織が `suspended` の場合は全業務操作を拒否

## 6. その他のセキュリティ対策

| 項目 | 対策 |
|---|---|
| パスワード | Supabase Auth（bcrypt）。最小 10 文字、漏洩パスワード検出を有効化、管理者は MFA 必須 |
| セッション | `@supabase/ssr` の HttpOnly Cookie。ミドルウェアで更新 |
| CSRF | Server Actions の Origin 検証（Next.js 標準）＋ Cookie `SameSite=Lax`。Route Handler の更新系も Origin を検証 |
| XSS | React のエスケープに依存し `dangerouslySetInnerHTML` 禁止（ESLint で検出）。CSP ヘッダー設定。テンプレートはプレーンテキストのみ |
| CSV | サイズ上限 5MB・行数上限 5,000、MIME/拡張子確認、文字コード判定、zod で行ごと検証、エクスポート時の数式インジェクション対策（`= + - @` で始まる値を `'` でエスケープ） |
| 環境変数 | `.env.local` は git 管理外。`SUPABASE_SERVICE_ROLE_KEY` は `server-only` モジュールからのみ参照 |
| 環境分離 | 開発・本番で Supabase プロジェクトを分離。本番の認証情報は Vercel Production 環境のみに設定 |
| レート制限 | ログイン・招待・CSV 取込・エクスポートに制限（Supabase Auth 標準＋アプリ側） |
| 監査 | 04 の audit_logs 参照 |
