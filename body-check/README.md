# あんど式 カラダ年齢チェック

「あなたのカラダ、何歳レベル？」— あんど整骨院 香里園院の LINE 公式アカウントから開く、スマホ向けのセルフ身体チェック Web アプリです。

- ログイン不要・個人情報（氏名／電話／メール）は取得しません
- 採点はすべて利用者のスマホ内（ブラウザ）で行います
- 本チェックは医療診断ではありません。スコアは独自の参考指標です

---

## 1. 画面の流れ

```
トップ（/）
  └ 無料でチェックする
      ├ STEP0 年代・気になる症状
      ├ （統計ON時のみ）データ利用の同意
      ├ 安全上の注意（確認チェック必須／中止案内あり）
      ├ CHECK1 バランス（片足立ち・左右／ストップウォッチ付き）
      ├ CHECK2 下半身（30秒椅子立ち上がり・カウントダウン付き）
      ├ CHECK3 柔軟性（前屈）
      ├ CHECK4 肩の動き（両腕上げ）
      └ CHECK5 コンディション（5問）
結果（/result）
  スコア／ランク／レーダーチャート／項目別評価／得意・改善項目／セルフケア最大3つ／WEB予約
```

どの画面でも「戻る」「この項目をスキップ」ができ、途中で閉じても 24 時間以内なら続きから再開できます。

## 2. フォルダ構成

```
body-check/
├─ src/
│  ├─ config/              ★ 内容を変えたいときに編集するファイル
│  │  ├─ checks.ts         チェック項目・選択肢・採点基準（点数）
│  │  ├─ scoring.ts        ランクの境目・メッセージ・「情報不足」の基準
│  │  ├─ selfcare.ts       セルフケアの内容（動画URLもここ）
│  │  └─ site.ts           院名・予約URL・統計ON/OFF
│  ├─ lib/                 計算などの処理（画面とは分離）
│  │  ├─ scoring.ts        採点ロジック
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

- **採点基準を変える** → `src/config/checks.ts` の `points` / `LEGS_THRESHOLDS`
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

## 7. 注意事項

- 採点基準は医学的に検証されたものではなく、サービス独自の仮の参考指標です。
- 年齢別基準による「身体年齢」は、信頼できる研究データを参照して実装するまで表示しません。
- セルフケアは一般的な低負荷の運動に限定し、肩の痛み・日常的な痛みがある回答では運動の提案を控えめにし、専門家への相談を案内します。
