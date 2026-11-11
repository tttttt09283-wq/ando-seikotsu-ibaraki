# 08. API 仕様書（Phase 1）

Phase 1 は外部公開 API を持ちません。画面からの操作は **Next.js Server Actions**、
ファイル出力と定期実行は **Route Handlers**、集計や複数テーブルの一括操作は **PostgreSQL 関数（RPC）** で実装しています。

## 共通仕様

| 項目 | 仕様 |
|---|---|
| 認証 | Supabase Auth のセッション Cookie（HttpOnly）。`proxy.ts` で更新 |
| 組織の特定 | URL の `orgSlug` → `getOrgContext()` で所属を検証。**クライアントから organization_id を受け取らない** |
| 認可 | ① `assertCan(ctx, permission, storeId)`（`lib/auth/permissions.ts`）② DB の RLS |
| 対象店舗 | 更新対象の行を DB から取得し、その `store_id` で権限を判定（送信された店舗 ID を信用しない） |
| 入力検証 | zod。エラーは `{ error, fieldErrors }` で返す |
| 戻り値 | `ActionState = { ok?, message?, error?, fieldErrors? }`。成功時に画面遷移するものは `redirect` |
| エラー | DB エラーは利用者向けの文言に変換（内部情報を返さない）。権限なしは 404 または「権限がありません」 |
| CSRF | Server Actions は Next.js の Origin 検証。Route Handler（POST）は `isSameOrigin()` |

## Server Actions

### 認証（`app/auth-actions.ts`）
| 関数 | 入力 | 説明 |
|---|---|---|
| `signIn` | email, password | ログイン。失敗理由は区別しない |
| `signOut` | — | ログアウト |
| `requestPasswordReset` | email | 再設定メール送信。登録の有無に関わらず同じ応答 |
| `updatePassword` | password, confirm | 10文字以上・英大小文字・数字 |
| `verifyMfa` | factorId, code | TOTP 確認（管理者は aal2 必須） |

### タスク（`app/o/[orgSlug]/tasks/actions.ts`）
| 関数 | 権限 | 入力 | 説明 |
|---|---|---|---|
| `recordTaskAction` | task.act | taskId, status, channel?, outcome?, content?, note?, templateId? | 対応記録とステータス更新を1トランザクション（RPC `record_task_action`）。連絡タスクの「対応済み」は連絡手段必須、「対象外」は理由必須 |
| `assignTask` | 自分：task.act／他人：task.assign_others | taskId, assignee（"me" / user_id / ""） | 担当変更 |
| `createManualTask` | task.act | customerId, title, dueOn, kind, priority | 手動タスク作成。連絡不可顧客には連絡タスク不可 |

### 顧客（`app/o/[orgSlug]/customers/actions.ts`）
| 関数 | 権限 | 説明 |
|---|---|---|
| `createCustomer` / `updateCustomer` | customer.write（移動元・移動先の両店舗） | 顧客番号は空なら自動採番 |
| `recordConsent` | consent.record | 同意・連絡不可・配信停止（追記専用）。停止時は未完了の連絡タスクを自動で対象外 |
| `addVisit` / `deleteVisit` | visit.record / 削除は store.update | 未来日不可 |
| `addAppointment` / `updateAppointmentStatus` | visit.record | 入力は日本時間 |
| `addNote` | customer.write | 2000文字まで |
| `setTags` | customer.write | 新規タグ作成を含む |
| `anonymizeCustomer` | customer.delete（組織管理者） | 「削除」と入力して確定。RPC `anonymize_customer` |

### CSV 取込（`app/o/[orgSlug]/customers/import/actions.ts`）
| 関数 | 権限 | 説明 |
|---|---|---|
| `importCsv` | customer.import | kind（customers / visits / appointments）、storeId、file、skipErrors。検証エラーがあり skipErrors でなければ何も取り込まない。結果は `import_jobs` に保存（値は保存しない） |

### テンプレート（`app/o/[orgSlug]/templates/actions.ts`）
| 関数 | 権限 | 説明 |
|---|---|---|
| `createTemplate` / `updateTemplate` | template.manage | 未定義の差し込み変数はエラー。更新で版数 +1 |
| `duplicateTemplate` | template.manage（いずれかの店舗） | 共通テンプレートを編集できない店舗責任者は自店舗用として複製 |
| `setTemplateArchived` | template.manage | アーカイブ／復元 |

### 設定（`app/o/[orgSlug]/settings/actions.ts`）
| 関数 | 権限 | 説明 |
|---|---|---|
| `updateOrganization` | organization.update | 会社情報、同意未確認の扱い、Staff の閲覧範囲 |
| `createStore` / `updateStore` | store.create / store.update | |
| `inviteStaff` | staff.invite（store_manager・org_admin の付与は staff.change_role） | 招待メール送信（Auth Admin API）→ 所属の追加はユーザー権限（RLS） |
| `setMembershipStatus` / `changeRole` | staff.invite / staff.change_role | 自分自身は変更不可 |
| `createRule` / `updateRule` | rule.manage | |
| `runExtraction` | rule.run | mode=preview（判定のみ）／run（抽出）。店舗責任者は自店舗の顧客のみ |

### 運営管理（`app/platform/actions.ts`）
| 関数 | 説明 |
|---|---|
| `createOrganization` | 組織＋初期テンプレート・ルール＋最初の店舗を作成 |
| `setOrganizationStatus` | 利用停止・再開（停止中は全業務操作が RLS で拒否される） |
| `inviteOrgAdmin` | 組織管理者を招待 |

## Route Handlers

| メソッド・パス | 認証 | 説明 |
|---|---|---|
| `GET /auth/confirm?token_hash&type&next` | なし（メールのリンク） | 招待・再設定リンクの検証。`next` はアプリ内パスのみ許可 |
| `POST /api/o/{orgSlug}/export/customers` | セッション＋Origin 確認＋customer.export | 顧客 CSV（UTF-8 BOM、数式インジェクション対策）。監査ログ記録 |
| `GET /api/cron/generate-tasks` | `Authorization: Bearer ${CRON_SECRET}`（定数時間比較） | 全組織のフォロー抽出。レスポンスは件数のみ |

## PostgreSQL 関数（RPC）

| 関数 | 実行者 | 種別 | 説明 |
|---|---|---|---|
| `record_task_action` | authenticated | invoker（RLS 適用） | 対応記録＋ステータス更新 |
| `dashboard_summary(org, as_of)` | authenticated | invoker | ダッシュボード集計 |
| `analytics_summary(org, from, to, as_of)` | authenticated | invoker | 店舗別実績（因果を示さない定義） |
| `anonymize_customer(customer)` | authenticated | definer（org_admin を検証） | 個人情報の匿名化 |
| `log_audit_event(...)` | authenticated | definer（所属を検証） | エクスポート等の明示的な監査記録 |
| `platform_*` | authenticated | definer（platform_admins を検証） | 組織作成・停止・件数一覧・運営ログ |
| `followup_customer_snapshots(org, as_of)` | service_role のみ | definer | 抽出ジョブ用スナップショット |

## Phase 2 で追加予定
LINE Webhook（`POST /api/line/webhook/{channelId}`、署名検証）、送信キュー処理。11_phase2-line.md 参照。
