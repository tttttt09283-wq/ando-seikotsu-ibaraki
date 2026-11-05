# あんど式 カラダ年齢チェック

「あなたの姿勢・体幹は何歳？」— あんど整骨院 香里園院の LINE 公式アカウントから開く、スマホ向けのセルフ身体チェック Web アプリです。

- ログイン不要・個人情報（氏名／電話／メール）は取得しません
- 採点はすべて利用者のスマホ内（ブラウザ）で行います
- 本チェックは医療診断ではありません。スコアは独自の参考指標です

---

## 1. 画面の流れ

```
トップ（/）
  └ 無料でチェックする
      ├ STEP0 年齢（数字）・性別・気になる症状
      ├ （統計ON時のみ）データ利用の同意
      ├ 安全上の注意（確認チェック必須／中止案内あり）
      ├ CHECK1 バランス力（片足立ち・目を開けて・左右／最大60秒・ストップウォッチ付き）
      ├ CHECK2 体幹の強さ（プランクのキープ秒数・ストップウォッチ付き）
      ├ CHECK3 柔軟性（前屈）
      └ CHECK4 瞬発力（30秒スクワット・椅子を使って・カウントダウン付き）
結果（/result）
  姿勢・体幹年齢（〇〇歳・実年齢との差・項目ごとの年齢）／スコア／ランク／レーダーチャート／項目別評価／
  得意・改善項目／セルフケア最大3つ／WEB予約
```

どの画面でも「戻る」「この項目をスキップ」ができ、途中で閉じても 24 時間以内なら続きから再開できます。

## 2. フォルダ構成

```
body-check/
├─ src/
│  ├─ config/              ★ 内容を変えたいときに編集するファイル
│  │  ├─ checks.ts         チェック項目・選択肢・採点基準（点数）
│  │  ├─ scoring.ts        ランクの境目・メッセージ・「情報不足」の基準
│  │  ├─ bodyAge.ts        姿勢・体幹年齢の基準データ（項目ごと・年齢ごとの目安の値）
│  │  ├─ selfcare.ts       セルフケアの内容（動画URLもここ）
│  │  └─ site.ts           院名・予約URL・統計ON/OFF
│  ├─ lib/                 計算などの処理（画面とは分離）
│  │  ├─ scoring.ts        採点ロジック
│  │  ├─ bodyAge.ts        姿勢・体幹年齢の判定
│  │  ├─ selfcare.ts       セルフケアの選び方
│  │  ├─ storage.ts        ブラウザ内への途中保存
│  │  ├─ stats.ts          匿名統計（同意者のみ）
│  │  └─ *.test.ts         単体テスト
│  ├─ components/          画面の部品
│  │  ├─ check/            チェック画面（進行役・各ステップ・タイマー・安全案内）
│  │  ├─ result/           結果画面（レーダーチャート・セルフケアカード）
│  │  ├─ Illustrations.tsx イラスト（SVG）
│  │  └─ ui.tsx            ボタン・カードなど共通部品
│  ├─ app/                 ページ（URLと1対1で対応）
│  │  ├─ page.tsx          トップ（/）
│  │  ├─ check/            チェック（/check）
│  │  ├─ result/           結果（/result）
│  │  ├─ privacy/          プライバシー説明（/privacy）
│  │  └─ api/stats/        匿名統計の受け口（/api/stats）
│  └─ types.ts             データの形の定義
├─ .env.example            環境変数のサンプル
└─ package.json            使うライブラリとコマンドの一覧
```

## 3. 自分のパソコンで動かす

事前に [Node.js](https://nodejs.org/ja)（LTS 版、20.9 以上）をインストールしてください。

```bash
cd body-check
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開くと表示されます（止めるときは `Ctrl + C`）。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発用サーバーを起動（保存すると自動で画面に反映） |
| `npm test` | 採点ロジックなどの単体テストを実行 |
| `npm run lint` | 型チェック（書き間違いの検出） |
| `npm run build` | 本番用にビルド（公開前の最終確認） |

## 4. 設定（環境変数）

`.env.example` をコピーして `.env.local` を作り、値を入れます。

```bash
cp .env.example .env.local
```

| 名前 | 内容 | 未設定のとき |
| --- | --- | --- |
| `NEXT_PUBLIC_BOOKING_URL` | WEB予約ページのURL（`https://` のみ） | 予約ボタンは「準備中」で無効 |
| `NEXT_PUBLIC_STATS_ENABLED` | `true` で匿名統計を有効化（同意画面が出る） | 統計は一切送信しない |

> `NEXT_PUBLIC_` で始まる値はビルド時に埋め込まれます。Vercel で値を変えたら **再デプロイ** が必要です。

## 5. よくある変更

- **結果の解説文（良い点・気をつけたい点・整骨院で確認できること）を変える** → `src/config/feedback.ts`
- **姿勢・体幹年齢の基準を見直す** → `src/config/bodyAge.ts` の `BODY_AGE_CURVES`（年齢ごとの「ふつうの記録」。年齢が上がるほど同じか小さくなるように）
- **採点基準を変える** → `src/config/checks.ts` の `points` / `PLANK_THRESHOLDS` / `LEGS_THRESHOLDS`
- **ランクの境目・文言** → `src/config/scoring.ts` の `RANKS`
- **セルフケアの追加・動画** → `src/config/selfcare.ts`（`videoUrl` に `https://www.youtube.com/embed/動画ID`）
- **他院への展開** → `src/config/site.ts` の院名と、院ごとの Vercel プロジェクト＋環境変数

変更後は `npm test` でテストが通ることを確認してください（基準値を変えた場合はテストの期待値も合わせて更新します）。

## 6. Vercel で公開する手順

このリポジトリのルートには既存の予約システムがあるため、**別の Vercel プロジェクト**として `body-check` フォルダだけを公開します。

1. https://vercel.com にログインし「Add New… → Project」
2. GitHub リポジトリ `ando-seikotsu-ibaraki` を「Import」
3. **Root Directory** の「Edit」から `body-check` を選択（重要）
4. Framework Preset が「Next.js」になっていることを確認
5. 「Environment Variables」に `NEXT_PUBLIC_BOOKING_URL`（予約ページURL）を追加
   - 匿名統計を使う場合は `NEXT_PUBLIC_STATS_ENABLED` = `true` も追加
6. 「Deploy」を押す → 数分で `https://〜.vercel.app` のURLが発行されます
7. スマホで開いて、最初から結果まで一通り動作確認
8. LINE Official Account Manager → リッチメニュー → アクションを「リンク」にして、発行されたURLを設定

### 統計データの確認（統計ON時）

現在は Vercel の「Logs」に `body-check-stats` という1行の JSON として記録されます。管理画面での集計が必要になったら、`src/app/api/stats/route.ts` にデータベース保存を追加してください。

## 7. カラダチェックからの予約の見分け方

結果画面の予約ボタンは、予約ページ（`booking.html`）に `?src=body-check&bc=結果の要約` を付けて開きます。
予約フォームはこれを読み取り、次の3か所に目印を残します。

- **予約データ**：`bookings` テーブルの `from_body_check`（true/false）と `body_check_summary`（例：姿勢・体幹年齢 52歳（実年齢47歳）／スコア68点・Bランク）
- **グループLINEの新規予約通知**：「📋 カラダ年齢チェック経由（…）」の1行
- **管理画面**：予約詳細に「📋 カラダチェック経由」バッジ、患者情報に「カラダチェック」欄、タイムラインに 📋 マーク

LINEログインでページが開き直されても目印が消えないよう、予約フォームはブラウザのタブ内（sessionStorage）にも控えています。

件数の確認（Supabase の SQL Editor）：

```sql
select count(*) from bookings where from_body_check and not cancelled;
```

## 7. 注意事項

- 採点基準は医学的に検証されたものではなく、サービス独自の仮の参考指標です。
- 「姿勢・体幹年齢」は、4つのチェックの記録を年齢ごとの「ふつうの記録」の表と比べて項目ごとの年齢を出し（表の間は按分）、測った項目の平均を表示します（20〜85歳）。実年齢との差が3歳未満なら「年齢相応」とします。性別「回答しない」の場合は男女の平均の表で判定します。
  - 瞬発力（30秒スクワット・椅子を使って）は、日本人の性別・年代別標準値（中谷敏昭ほか「30秒椅子立ち上がりテスト（CS-30テスト）成績の加齢変化と標準値の作成」臨床スポーツ医学 20(3), 2003）の「普通」の範囲の中央の値を使っています。
  - バランス力（片足立ち・目を開けて）・体幹の強さ（プランク）・柔軟性（前屈）は、この測り方での日本人の年代別標準値がないため「あんど式」独自の仮の目安です。測定した方の記録がたまったら、院の実感に合わせて `src/config/bodyAge.ts` の数字を見直してください。
- セルフケアは一般的な低負荷の運動に限定し、全項目スキップの場合はごく軽い内容だけにして、専門スタッフへの相談を案内します。

## 8. 他院への販売ページ（/for-clinics）

導入を検討している整骨院・治療院向けに、次のページを公開しています（検索エンジンにも表示されます）。

| URL | 内容 |
| --- | --- |
| `/for-clinics` | 概要・選ばれる理由・料金・導入の流れ・FAQ・お問い合わせ（デモのQRコード付き） |
| `/demo` | デモ。チェックを最初から試せます（デモ中は統計を送らず、結果画面の予約ボタンの代わりに導入の案内を表示） |
| `/for-clinics/flow` | 集客〜成約までの活用手順（7ステップ）と、見込みの計算 |
| `/for-clinics/guide` | 導入ガイド（準備物・LINE設定・予約連携・店頭掲示・スタッフ共有・チェックリスト） |
| `/for-clinics/sns` | SNS投稿文（Instagram・ストーリーズ・LINE配信・X/Threads・Googleビジネスプロフィール） |
| `/for-clinics/templates` | 店頭テンプレート（A4ポスター・卓上カード・受付／結果説明／提案トーク・LINE文例。1枚ずつ印刷可） |

- SNS投稿文・店頭テンプレートは、院名・URL・特典を入力すると文中とQRコードに自動で入ります（入力内容はブラウザ内だけに保存）。
- **料金**：`src/config/sales.ts` の `pricing`（未設定なら「お問い合わせください」）
- **お問い合わせ先**：環境変数 `NEXT_PUBLIC_SALES_CONTACT_URL` / `NEXT_PUBLIC_SALES_CONTACT_EMAIL`（未設定なら「準備中」）
- **公開URL**：環境変数 `NEXT_PUBLIC_SITE_URL`（デモのQRコードに使用）
- 患者様向けの画面（トップ・チェック・結果）は `src/app/(app)/` に、販売ページは `src/app/for-clinics/` にあります（URLは今までと同じ）。

## 9. 4つのチェックメニュー

トップページ（`/`）から、次の4つを選べます。どのチェックも結果画面から予約へ進め、結果の要約が予約フォームに引き継がれます（`?src=body-check&bc=…`）。

| URL | チェック | 内容 | 設定・判定のファイル |
| --- | --- | --- | --- |
| `/check` | カラダ年齢チェック | 4項目（片足立ち・プランク・前屈・スクワット）で「姿勢・体幹年齢 〇〇歳」 | `src/config/checks.ts`・`src/config/bodyAge.ts` ほか |
| `/posture` | AI姿勢チェック | 横向き・正面の写真を MediaPipe Pose で解析（写真はスマホ内だけで処理） | `src/lib/posture.ts` |
| `/skeleton` | 骨格タイプチェック | 10問でストレート／ウェーブ／ナチュラル | `src/config/skeleton.ts`・`src/lib/skeleton.ts` |
| `/core` | 体幹チェック | プランク・サイドプランク・片脚ヒップリフト・座って脚上げの4テスト | `src/config/core.ts`・`src/lib/core.ts` |

- AI姿勢チェックは、開いたときだけ `cdn.jsdelivr.net` から MediaPipe Pose を読み込みます。判定基準は院内の「体のチェック（AI姿勢分析）」と同じです。
- `/demo` はメニュー画面を開くので、4つすべてをデモで試せます。

