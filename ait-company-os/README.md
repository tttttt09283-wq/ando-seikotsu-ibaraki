# A.I.T company OS v0.1

CEOがAI組織を指揮し、AI社員が実際に仕事を進める **AI COMPANY OPERATING SYSTEM**。

- 会社名：A.I.T company / CEO：岩永 拓己 / 理念：「自由に、自分たちが楽しい。」
- MISSION 001：知らない顧客から、A.I.T companyとして最初の1円を生み出す（月間目標 ¥100,000）

> このフォルダは、同じリポジトリ内の整骨院システム（ルートのHTML・`api/`・`body-check/`）とは独立したアプリです。既存ファイルには手を加えていません。

## 起動方法

```bash
cd ait-company-os
npm install
npm run dev        # http://localhost:3000
```

環境変数は不要です（未設定なら **DEMO MODE** で起動）。ログイン画面の「CEOとしてデモに入る」から入場し、「チャド、MISSION 001を進めて」と指示してください。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm test` | テスト（Vitest） |
| `npm run typecheck` | 型チェック |
| `npm run build` / `npm start` | 本番ビルド / 起動 |

## 画面

| パス | 機能 |
|---|---|
| `/` | CEO DASHBOARD（指示入力・KPI・MISSION進捗・CHADメッセージ・LIVE COMPANY MAP・ACTIVITY STREAM） |
| `/chad` | CHAD COMMAND（指示ごとの判断・Project・Task・進行状況・報告） |
| `/organization` | LIVE COMPANY MAP（組織図＋社員詳細パネル） |
| `/approvals` | HUMAN APPROVAL（承認・却下・修正依頼） |

## 仕組み

```
CEO指示 → CHAD分析(MISSION/KPI確認・優先度・反対意見) → Project作成 → Task分解
 → 担当役員/AI社員へ割当 → THINKING → WORKING(成果物) → マネージャーレビュー
 → (修正依頼ならREVISION→再作業) → 外部行動はCEO承認待ち → CHADが集約・報告
```

- `src/lib/engine/engine.ts` … CHAD CORE。保存データ上の状態機械として進行。AI処理は「リース取得→ロック外で実行→リース確認して確定」で二重実行を防止。
- `src/lib/engine/executor.ts` … CHAD・AI社員の「頭脳」のインターフェース。DEMOは `demo-executor.ts`、PHASE 3で Claude API 実装に差し替え。
- `src/lib/store/store.ts` … 保存層（DEMOは `.data/demo-company.json`）。PHASE 3で Supabase 実装に差し替え。
- `src/lib/view.ts` … 社員の稼働状態はTaskの実データから算出（架空の稼働は表示しない）。

### 安全対策
1日・月間のAI予算上限、同時実行数（会社全体・社員ごと）、社員ごとの1日Task上限、1日の指示数・同時進行指示数の上限、
1指示あたりのTask上限、再試行上限（指数バックオフ）、レビュー差し戻し上限、1サイクルの遷移数上限、連続エラー時の安全停止、
処理リースのタイムアウト、送信IDによる二重送信防止、監査ログ。上限値は `.env.example` 参照。

### DEMO MODE
すべての記録に `mode: "demo" | "live"` を付与し、画面には「DEMO」「推定」を明示。デモの成果は売上・利益・「最初の1円」に含めません。
デモでは外部送信・投稿・支払いは一切行いません。

### 認証
署名付きCookieセッション（proxy.ts と各APIで二重に確認）、同一オリジン確認、入力はZodで検証、ログイン試行制限。
本番データを扱う前に `CEO_PASSCODE` と `SESSION_SECRET`（32文字以上）を設定してください。
