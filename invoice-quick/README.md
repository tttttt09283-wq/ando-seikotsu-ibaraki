# Invoice Quick

> 請求書づくり、毎回ゼロからやっていませんか？

Googleスプレッドシートに必要情報を入力し、メニューを1回操作するだけで **請求書・見積書のPDF** を生成する、買い切り型の Google Apps Script ツールです。
外部API・外部ライブラリ・月額費用は不要で、Googleアカウントだけで動作します。

## 機能

| ID | 機能 | 概要 |
|---|---|---|
| F01 | 顧客管理 | 「顧客マスタ」シート。入力シートで顧客IDを選ぶと宛名・住所などを自動表示 |
| F02 | 請求書作成 | 明細最大20行、税率 10/8/0%、税抜入力、税率ごとに1回の端数処理（切り捨て/四捨五入/切り上げ）、源泉徴収（任意） |
| F03 | PDF自動生成 | 必須チェック → 計算・検算 → Doc複製 → 差し込み → PDF変換 → Drive保存 → 完了ダイアログ |
| F04 | 見積書生成 | 見積書番号・有効期限・見積条件に対応。見積書 → 請求書への転記機能 |
| F05 | 履歴管理 | 「発行履歴」シートに自動記録。同一番号の二重発行を警告 |
| F06 | メール文面生成 | 宛名・書類種別・金額・期限・振込先を反映した文面＋コピー/Gmail下書きボタン |
| F07 | 初期設定 | 「初期設定」シート。`setupInvoiceQuick` でシート・保存先フォルダ・Docテンプレートを自動作成し、IDを自動セット |

## ディレクトリ構成

```
invoice-quick/
├── src/                     # Apps Script にそのまま貼り付けるファイル
│   ├── Main.gs              # onOpen メニュー、setupInvoiceQuick（ワンクリック初期化）、シート作成、エラー処理
│   ├── Config.gs            # 定数（シート名・色・セル配置）、初期設定シートの読み書き
│   ├── Customer.gs          # 顧客マスタ、宛名の組み立て
│   ├── Calculator.gs        # 金額計算（純粋関数・BigInt で誤差なし）
│   ├── Validator.gs         # 入力値の検証（修正セルを日本語で案内）
│   ├── History.gs           # 発行履歴、自動採番、二重発行チェック
│   ├── PdfGenerator.gs      # Docテンプレート作成・差し込み・PDF変換・Drive保存
│   ├── Invoice.gs           # 請求書メイン処理（LockService 排他制御、メール文面、完了ダイアログ）
│   ├── Estimate.gs          # 見積書メイン処理、見積書→請求書転記
│   ├── Utils.gs             # 日付・通貨フォーマット、ファイル名サニタイズ
│   └── appsscript.json      # マニフェスト（V8・Asia/Tokyo・必要最小限のスコープ）
├── docs/
│   ├── setup-guide.md       # 初心者向け5分セットアップマニュアル（承認画面の突破手順含む）
│   ├── faq.md               # FAQ・エラー対処法・インボイス制度に関する免責事項
│   └── sales-guide.md       # note 有料記事コピー、Threads 実演投稿台本、販売前チェックリスト
└── tests/
    └── calculator.test.js   # 計算ロジック検証（Node.js 標準のテストランナー）
```

## 処理フロー（PDF作成）

```
メニュー「請求書PDFを作成」
  └ runDocumentGeneration_('invoice')            … Invoice.gs
      1. readDocumentInput_ → validateSettings / validateDocumentInput / validateCustomerLookup
         └ エラーがあれば修正セルを選択し、日本語で一覧表示して終了
      2. calculateDocument → checkCalculationIntegrity（検算）→ validateCalculation
      3. findIssuedRecords（同一番号の確認ダイアログはロック取得前に表示）
      4. LockService.getDocumentLock().tryLock
           ├ 番号を再確認（確認中に他の操作で発行されていないか）
           ├ generatePdf：テンプレート複製 → 差し込み → PDF → Drive保存（一時Docは finally で必ず削除）
           ├ appendHistory（失敗したら PDF を削除して成功扱いにしない）
           └ releaseLock
      5. showResultDialog_（PDFリンク・メール文面）
```

## 計算ルール

1. 明細金額 = 数量 × 単価（税抜）。1円未満は設定の端数処理
2. 税率（10/8/0%）ごとに明細金額を合計
3. 消費税 = 税率別合計 × 税率（**税率ごとに1回だけ端数処理**）
4. 合計 = 小計 + 消費税合計
5. 源泉徴収（任意）= 小計 × 10.21%（100万円超の部分は 20.42%）、1円未満切り捨て

数量・単価は 10⁴ 倍した BigInt で計算するため、`0.07 × 100 = 7.000000000000001` のような浮動小数点誤差の影響を受けません。

## テスト

Node.js 18 以上で実行できます（依存パッケージなし）。

```bash
cd invoice-quick
npm test
# または
node --test tests/calculator.test.js
```

テスト内容：端数処理（3モード × 正負・境界値）、浮動小数点の罠、税率別集計、値引き、源泉徴収、検算機能、独立した参照実装とのランダム照合（3,000ケース）、入力検証、ファイル名サニタイズ、全 `.gs` ファイルの構文チェック。

## 導入

購入者向けの手順は [docs/setup-guide.md](docs/setup-guide.md) を参照してください。
販売者向けの配布用テンプレートの作り方は [docs/sales-guide.md の販売前チェックリスト](docs/sales-guide.md#5-販売前チェックリスト配布用テンプレートの作り方) を参照してください。

## 免責

本ツールは書類作成と金額計算を補助するものであり、税務上の判断を保証するものではありません。詳細は [docs/faq.md](docs/faq.md#免責事項) を参照してください。
