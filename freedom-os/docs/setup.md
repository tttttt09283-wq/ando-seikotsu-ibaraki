# Supabase・Vercel 設定手順

所要時間の目安：20〜30分。認証情報（URL・キー）はこの手順の中でご自身で取得・設定してください。チャットやリポジトリには貼り付けないでください。

---

## 1. Supabase（データベース・ログイン）

### 1-1. プロジェクトを作る

1. https://supabase.com/dashboard で **New project**
2. 名前（例：`freedom-os`）、データベースのパスワード、リージョン **Northeast Asia (Tokyo)** を選んで作成
   - 勤務先（あんど整骨院）の Supabase プロジェクトとは**別に**作成してください。

### 1-2. テーブルを作る

1. 左メニュー **SQL Editor** → **New query**
2. `freedom-os/supabase/migrations/20261114000000_init.sql` の内容をすべて貼り付けて **Run**
3. **Table Editor** に `profiles`、`user_settings`、`mandala_goals`、`mandala_actions`、`tasks` など18個のテーブルができていることを確認
4. 各テーブルに **RLS enabled** と表示されていることを確認

> Supabase CLI を使う場合は `supabase link` のあと `supabase db push` でも適用できます。

### 1-3. ログインの設定

1. **Authentication → Sign In / Providers → Email** が有効になっていることを確認
2. **Authentication → URL Configuration**
   - **Site URL**：本番の URL（例：`https://freedom-os-xxxx.vercel.app`）
   - **Redirect URLs**：`https://（本番のURL）/auth/callback` と、ローカル確認用に `http://localhost:3000/auth/callback`
3. 自分だけで使う場合は、最初の登録が終わったあと **Authentication → Sign In / Providers → Allow new users to sign up** をオフにするか、Vercel 側で `ALLOWED_EMAILS` を設定してください（両方がおすすめ）。

### 1-4. 接続情報を控える

**Project Settings → API**（または **Connect**）から次の2つを控えます。

| 環境変数 | 値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL（`https://xxxx.supabase.co`） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon（public）キー、または publishable キー |

> `service_role` キーは**使いません**。設定しないでください。

---

## 2. Vercel（公開）

1. https://vercel.com/new で、このリポジトリ（`ando-seikotsu-ibaraki`）を Import
2. **Root Directory** を `freedom-os` に変更（Framework は Next.js が自動選択されます）
3. **Environment Variables** に次を設定（Production と Preview の両方）

| 名前 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 必須 | 1-4 で控えた URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必須 | 1-4 で控えた anon キー |
| `ALLOWED_EMAILS` | 推奨 | 利用を許可するメールアドレス（カンマ区切り） |
| `ANTHROPIC_API_KEY` | 任意 | AI 経営参謀を使う場合。https://console.anthropic.com で発行 |
| `ANTHROPIC_MODEL` | 任意 | 省略時 `claude-opus-5-5` |

4. **Deploy**
5. 発行された URL を Supabase の Site URL / Redirect URLs（1-3）に登録

> 既存の予約管理システム（リポジトリ直下）の Vercel プロジェクトには、`.vercelignore` で `freedom-os` を含めないようにしています。FREEDOM OS は必ず別プロジェクトとして作成してください。

---

## 3. 初回ログインと確認

1. 公開 URL を開く → 「はじめての方：新規登録」→ メールアドレスとパスワード（8文字以上）
2. 確認メールのリンクを開く → ログイン
3. 初回は自動で次が作成されます（既存データがある場合は何も変更しません）
   - 初期マンダラ（中心目標＋8領域＋64行動、KPI と期限つき）
   - 3シナリオ（保守・標準・挑戦）の前提値
   - 7つの独立判定条件、7つのマイルストーン
4. 動作確認
   - 月次実績に今月の数字を入れて保存 → ダッシュボードとマンダラ A8 に反映される
   - マンダラのマスをタップ → 「行動計画」タブ →「タスクとして登録」→ ダッシュボードに今日の行動が出る
   - 設定 →「全データ（JSON）」でバックアップが取れる

## 4. AI 経営参謀を有効にする

1. Anthropic Console で API キーを発行（利用上限を設定しておくと安心です）
2. Vercel の Environment Variables に `ANTHROPIC_API_KEY` を追加 → Redeploy
3. 画面「AI経営参謀」で「AIで分析する」
   - 連続実行は1分に1回までに制限しています。
   - キーはサーバーだけで使われ、ブラウザには送られません。

## 5. 困ったとき

| 症状 | 確認すること |
| --- | --- |
| 「データベースの設定が必要です」と出る | Vercel の環境変数 2つが設定されているか。設定後に Redeploy したか |
| ログインできない | 確認メールのリンクを開いたか。Redirect URLs に `/auth/callback` があるか |
| 「このメールアドレスでは利用できません」 | `ALLOWED_EMAILS` にそのアドレスが入っているか |
| 保存時に権限エラー | マイグレーション SQL を最後まで実行したか（RLS ポリシーと grant が必要） |
| AI 分析がエラー | `ANTHROPIC_API_KEY` が正しいか、利用上限に達していないか |
