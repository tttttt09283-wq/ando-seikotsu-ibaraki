# 岩永拓己 鍼灸 予約管理（iwanaga-booking）

鍼灸師 岩永拓己の個人ブランド向けの、スマホ対応の予約管理アプリです。
Threads・Instagram・プロフィールリンクから予約フォームへ誘導し、**公式LINEで仮予約を受け付け、管理者が承認したときだけ予約が確定**します。

> このフォルダは、あんど整骨院の既存予約システム（リポジトリ直下）とは**別のアプリ・別の Vercel プロジェクト・別の Supabase プロジェクト**です。
> 個人の予約データと勤務先のデータを混ぜないため、データベースも分けてください。

---

## 1. 予約の流れとステータス

```
フォーム入力（draft：ブラウザ内だけ）
   │ 送信（サーバーで予約番号を発行・枠を30分仮押さえ）
   ▼
pending_line   フォーム保存済み・LINE送信待ち        ← LINEを開いただけでは変わらない
   │ 公式LINEに「予約番号＋確認コード」が届く（Webhook：署名検証・重複排除・送信元照合）
   │ または 管理者が手動で照合
   ▼
pending_review LINE受付確認済み・管理者確認待ち（48時間仮押さえ）
   │ 管理者が承認（管理者だけ）           │ 日時変更を提案
   ▼                                      ▼
confirmed  予約確定 → 確定通知をLINEで送信   change_proposed（新しい枠を仮押さえ・元の枠は解放）
   │                                      │ お客様がLINEで承諾 → 管理者が承認 → confirmed
   ▼
completed  施術完了

いつでも：cancelled（キャンセル） / 期限切れ：expired（仮押さえの自動解放）
```

- 利用者の画面には、確定まで必ず「まだ予約は確定していません」と表示します。
- 確定通知は**承認後にだけ**送ります（予約の状態と通知の種類が一致しないと送れない作り）。
- LINE 送信に失敗しても予約は「確定」のまま。**通知ステータスは別管理**で、管理画面から再送できます。
- すべての状態変更・設定変更・個人情報の閲覧・CSV 出力を**監査ログ**（追記のみ・DBで更新/削除禁止）に残します。

## 2. 受付の可否（重要な制約）

| 施術場所 | 管理主体 | 受付開始の条件 |
| --- | --- | --- |
| 自宅プライベート鍼灸院 | 岩永拓己（個人） | 管理画面で「開業準備完了」を記録 → 受付開始 |
| あんど整骨院 茨木院 | 運営会社 | 管理画面で「会社の正式承認」を記録 → 受付開始 |
| あんど整骨院 香里園院 | 運営会社 | 同上 |

- 初期状態は**3拠点とも受付停止**。条件を満たさないと、画面・API・**DBの制約**のいずれでも予約できません。
- 自宅院の初期メニュー（初回 90分 12,000円／通常 60分 10,000円／集中 90分 15,000円、いずれも税込）は**提案価格・非公開**で登録済み。管理画面で「料金を承認して公開」するまで表示されません。
- 勤務先のメニュー・料金は登録していません。**会社が承認した料金だけ**を登録し、承認記録を入力して公開します。
- 料金・時間を変更すると自動で非公開に戻り、再承認が必要です。
- 「必ず治る」「完治」など医療効果を保証する表現は、メニュー・案内文に登録できません。

## 3. 個人情報の取扱い

- 予約・顧客・同意・LINE連携・通知のすべてに**管理主体（controller）と施術場所（location_id）**を持たせ、複合外部キーで組み合わせを強制しています。
- 同じ電話番号でも**施術場所ごとに別の顧客**として扱い、事業をまたいで名寄せしません。
- 氏名・電話番号・相談内容・LINEユーザーIDは **AES-256-GCM で暗号化**して保存。検索用には HMAC ハッシュを使います。
- 相談内容は任意・200文字まで（症状の詳細は来院時に伺う旨を表示）。
- 保持期間：相談内容は施術完了・キャンセル後 90 日、顧客情報は最終予約から 3 年で匿名化（毎日の Cron）。管理画面から本人の削除依頼にも対応できます。
- 自宅院の詳細住所は公開ページ・API に出さず、**確定通知（本人宛て）にだけ**記載します。
- RLS を全テーブルで有効化。公開キー（anon）からは何も読めません。管理者アカウントは許可された管理主体の行だけ読めます。
- 予約データを広告配信に使う機能はありません。

## 4. フォルダ構成

```
iwanaga-booking/
├─ supabase/migrations/   DB スキーマ（テーブル・制約・関数・RLS）と初期データ
├─ src/lib/domain/        状態遷移・枠計算・受付可否・入力検証・文面（純粋関数）
├─ src/lib/repo/          データ保存（pg.ts＝本番の PostgreSQL / memory.ts＝ローカル代替）
├─ src/lib/services/      業務処理（予約・承認・通知・設定・CSV・保持期間）
├─ src/lib/line/          LINE 署名検証・Webhook 処理・API 送信・LIFF 検証
├─ src/lib/auth/          管理者認証・権限
├─ src/app/               画面と API（/reserve, /admin, /api/...）
└─ scripts/               test-db.mjs（実DBテスト） / e2e-smoke.mjs（ブラウザE2E）
```

## 5. ローカルで動かす（外部サービスなし）

```bash
cd iwanaga-booking
npm install
cp .env.example .env.local   # ADMIN_LOCAL_PASSWORD だけ設定すれば動きます
npm run dev
```

- http://localhost:3000 … トップ / http://localhost:3000/reserve … 予約フォーム / http://localhost:3000/admin … 管理画面
- **ローカル代替モード**：`DATABASE_URL` が無いとデータは `.data/local-db.json` に保存、Supabase Auth が無いと `ADMIN_LOCAL_PASSWORD` で簡易ログイン、LINE 未設定だと「コピー＋公式LINEを開く」フォールバックと管理者の手動照合になります（「LINE送信確認済み」とは表示しません）。
- 本番（`NODE_ENV=production`）ではローカル代替モードでの起動を拒否します。

## 6. テスト

| コマンド | 内容 |
| --- | --- |
| `npm test` | 単体・業務フローのテスト（メモリ版） |
| `npm run test:db` | 実際の PostgreSQL にマイグレーションを適用し、同じ業務フロー＋DB制約・RLS・同時予約をテスト（ローカルの PostgreSQL か `TEST_DATABASE_URL`） |
| `npm run lint` | 型チェック |
| `node scripts/e2e-smoke.mjs` | 起動中のアプリをブラウザで操作（フォーム→LINE Webhook→承認→確定）。使い方はファイル冒頭 |

テストの範囲：フォーム検証、重複予約防止（同時送信・別拠点・移動時間・バッファ・ブロック・上限）、LINE Webhook 署名検証・重複排除・送信元照合・ロック、管理者認証・権限、承認フロー、通知失敗と再送、期限切れの自動解放、予約競合、CSV 権限、保持期間。

## 7. Supabase の準備

1. https://supabase.com で**新しいプロジェクト**を作成（リージョン：Tokyo）。勤務先システムとは別のプロジェクトにします。
2. SQL Editor で `supabase/migrations/` の SQL を**ファイル名の順に**実行（または `supabase db push`）。
3. Authentication → Users で管理者ユーザーを作成（メール＋パスワード）。サインアップは無効化を推奨（Authentication → Providers → Email → "Allow new users to sign up" をオフ）。
4. 作成したユーザーの ID を使って管理者を登録：

   ```sql
   insert into public.admin_users (auth_user_id, email, display_name, role, allowed_controllers, can_export)
   values ('<auth.users の id>', 'you@example.com', '岩永拓己', 'owner', array['iwanaga_private','enejoy_hand'], true);
   ```
   - 勤務先の承認前は `allowed_controllers` を `array['iwanaga_private']` にしておくのが安全です。
   - スタッフは `role = 'staff'`（閲覧・承認操作のみ。設定変更・受付可否・監査ログ不可。CSV は `can_export` で個別に許可）。
5. Project Settings → Database → Connection string の **Transaction pooler**（6543）を `DATABASE_URL` に。
6. Project Settings → API の URL と anon key を `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` に。**service_role キーは使いません**。

## 8. LINE 公式アカウントの準備

1. LINE Official Account Manager で岩永個人の公式アカウントの **Messaging API を有効化**。
2. LINE Developers のチャネルで：
   - チャネルシークレット → `LINE_CHANNEL_SECRET`
   - チャネルアクセストークン（長期） → `LINE_CHANNEL_ACCESS_TOKEN`
   - 「ボット情報」のユーザーID（U…） → `LINE_BOT_USER_ID`
   - Webhook URL：`https://<公開URL>/api/line/webhook` を設定し「Webhookの利用」をオン、「検証」が成功することを確認
3. 公式アカウントのベーシックID（@…） → `NEXT_PUBLIC_LINE_BASIC_ID`
4. 応答設定：「Webhook」オン。自動応答メッセージは必要に応じて（予約の返信はアプリが送ります）。
5. 任意（LIFF）：LINE Login チャネルを作り LIFF アプリ（エンドポイント `https://<公開URL>/reserve`、scope `openid profile`）を追加 → `NEXT_PUBLIC_LIFF_ID`、`LINE_LOGIN_CHANNEL_ID`。LINE アプリ内で開いたときに本人を識別し、**同じ LINE ユーザーからの送信だけ**を受け付けます。
6. 管理者への LINE 通知（任意）：管理者が公式アカウントを友だち追加し、そのユーザーIDを `ADMIN_LINE_USER_IDS` に、`ADMIN_LINE_NOTIFY=true`。メッセージ通数を消費するため、無料枠の範囲に注意してください。使わない場合は管理画面通知と（設定すれば）メール通知になります。

## 9. Vercel へのデプロイ

1. Vercel → Add New → Project → このリポジトリを Import
2. **Root Directory を `iwanaga-booking` に設定**（重要。リポジトリ直下の既存システムとは別プロジェクト）
3. Environment Variables に `.env.example` の値を設定（本番では最低限：`NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATA_ENCRYPTION_KEY`, `HASH_PEPPER`, `CRON_SECRET`, LINE 関連）
4. Deploy。リポジトリ直下の `.vercelignore` で、既存システムのデプロイにはこのフォルダを含めないようにしています。
5. Cron（`vercel.json`）：期限切れホールドの解放（1日1回）と保持期間処理（1日1回）。期限切れは予約作成・空き枠表示・Webhook・管理画面表示のたびにも解放するため、Hobby プランの1日1回でも枠は正しく解放されます。
6. SNS 用の短いURL：`/th`（Threads）、`/ig`（Instagram）、`/link`（プロフィールリンク）→ 流入元が予約に記録されます。

> `DATA_ENCRYPTION_KEY` を失うと暗号化した個人情報を読めなくなります。安全な場所に控えを保管し、変更しないでください。

## 10. 管理画面（/admin）

ダッシュボード（今日・今週・今月／LINE未確認・確認待ち・確定の件数／通知失敗）、予約検索（予約番号・電話番号・氏名・状態・場所・期間）、カレンダー（月・週・日）、予約詳細（承認・日時変更提案・キャンセル・完了・LINE手動照合・通知の再送・手動送信の記録・個人情報の削除）、場所別の受付可否・営業時間・休業日・メニュー・料金・受付ルール（バッファ・移動時間・締切・上限）・表示文面、枠ブロック、通知履歴、監査ログ、CSV 出力。
操作はすべて確認ダイアログ付きで、処理中はボタンを無効化し、サーバー側でもバージョン照合で二重操作を拒否します。

## 11. 公開前チェックリスト

- [ ] Supabase 本番プロジェクト作成・マイグレーション適用・`admin_users` 登録・サインアップ無効化
- [ ] Vercel の環境変数（暗号化キー・ペッパー・CRON_SECRET は新しく生成し、控えを保管）
- [ ] LINE Webhook URL の「検証」成功、実機で「フォーム送信 → LINE送信 → 自動返信 → 管理画面で確認待ち」になること
- [ ] 実機で承認 → 確定通知が届き、内容（場所・日時・メニュー・税込料金・所要時間・注意事項・変更窓口）が正しいこと
- [ ] 自宅院：開業の許可・届出・保険などの準備が整ってから「開業準備完了」を記録
- [ ] 自宅院：詳細住所・キャンセル規定・注意事項・個人情報の文面を確定し、料金を公開承認
- [ ] 勤務先：会社の正式承認（個人LINEでの予約情報の取扱い・管理主体・利用目的・閲覧範囲・料金）を書面で得てから記録。承認までは受付停止のまま
- [ ] 営業時間・休業日・バッファ・移動時間・受付締切・上限の確認
- [ ] 個人情報の取扱い・キャンセル規定のページを確認（`/privacy`, `/cancel-policy`）
- [ ] 文面に医療効果を保証する表現がないこと（広告規制：あん摩マッサージ指圧師、はり師、きゅう師等に関する法律）
- [ ] 管理者以外で `/admin` が開けないこと、CSV の出力権限
- [ ] SNS（Threads・Instagram）のリンクを `/th` `/ig` `/link` に設定
