# 整骨院 総売上シミュレーター

カルテ数・保険対応数・保険単価・鍼灸保険・自費売上を変えると、月間総売上がその場で再計算される経営ツール。
既存の静的サイト（リポジトリ直下）とは独立した Next.js アプリ。

> **予約管理システムに組み込み済み**：メニュー「分析・レポート → 総売上シミュレーター」（`index.html` の `SalesSimulatorPanel`）。
> 計算ロジックは `/sales-simulator-logic.js`（テスト `/test/sales-simulator.test.js`）で、予約管理システム側ではこちらを使う。
> 計算ルールを変えるときは、両方をそろえること。

> 初期値はデモ用の仮の数値で、実際の保険請求単価ではありません。保険の単価は実績にもとづく平均値として扱い、保険算定の適法性・請求可否は判定しません。

## 起動

```bash
cd sales-simulator
npm install
npm run dev        # http://localhost:3000
npm test           # 計算ロジックの単体テスト（Vitest）
npm run build && npm start   # 本番ビルド
```

Vercel に載せる場合は、新しいプロジェクトの Root Directory を `sales-simulator` にする（`hq/` と同じ方式）。

## 構成

```
src/
  app/                 layout.tsx / page.tsx / globals.css（色はここの @theme）
  lib/sim/             ← 計算ロジック（UI から独立・純粋関数）
    types.ts           入力・結果の型
    defaults.ts        デモ用の初期値
    sanitize.ts        入力の安全化（空欄・マイナス・率0〜100%）と丸めルール
    calc.ts            月間売上の計算
    reverse.ts         目標逆算（最小カルテ数の探索・4つの改善ケース）
    scenarios.ts       3パターンの保存形式（localStorage）
    format.ts          3桁区切り・単位つき表示
    *.test.ts          単体テスト
  hooks/use-simulator-store.ts   3パターンの編集中データと保存データ
  components/ui/       shadcn/ui 形式の部品（Button, Card, Slider, Switch, Tabs…）
  components/simulator/
    simulator-app.tsx  画面全体（ヘッダー・パターン切替・保存・タブ）
    simulator-tab.tsx  画面① 売上シミュレーター
    reverse-tab.tsx    画面② 目標逆算
    dashboard-tab.tsx  画面③ ダッシュボード（構成比・ゲージ・3パターン比較）
    number-field.tsx   数値入力＋スライダー（同期）
```

## 計算ルール

- 延べ来院数 = round(カルテ数 × 平均来院回数)
- 柔整対応数 = round(延べ来院数 × 柔整対応率)（直接入力も可。来院数を超える値は来院数までに抑える）
- 鍼灸対応数 = round(延べ来院数 × 鍼灸対応率)、1術 = round(鍼灸対応数 × 1術率)、**2術 = 鍼灸対応数 − 1術**（合計が必ず一致）
- EMS件数 = round(延べ来院数 × EMS利用率)
- 総売上 = 柔整 + 鍼灸 + 自費施術 + EMS + 物販 + その他（それぞれ1回だけ足す）
- 柔整・鍼灸の対応率はどちらも「延べ来院数に対する割合」。併用があるので合計100%超もOK。来院数・カルテ数は増えない
- 丸めはすべて四捨五入（浮動小数点の誤差を補正）。金額は 整数件数 × 整数円 なので常に整数
- 0で割る場面（目標0・カルテ0・スタッフ0・診療日数0）は「—」と表示する

### 目標逆算

- 固定売上 = 物販 + その他。連動売上 = それ以外（来院数に比例する）
- カルテ数・来院回数を変えるときは、各率と単価をそのまま使い、自費施術の件数は「今の 自費件数 ÷ 延べ来院数」の割合で増減させる
- 必要カルテ数は、端数処理を含めた本番の計算式で総売上を出し、目標を満たす最小の整数を二分探索で求める
- 比較する4ケース: カルテ数（1枚単位）、来院回数（0.1回単位、月31回まで）、鍼灸対応率（1%単位）、自費単価（10円単位）

## 今後の拡張

- **項目を足す**: `types.ts` → `defaults.ts` → `sanitize.ts` → `calc.ts` の順に足し、テストを書いてからカードに `NumberField` を追加する
- **複数院・月別データ**: `scenarios.ts` の保存形式（`version`）を上げ、localStorage を Supabase などに置き換える（計算ロジックはそのまま使える）
- **実績との比較**: 日計表・POS の実績を `SimInput` に変換する関数を作れば、実績値を「現在値」パターンに読み込める
- **CSV/Excel 出力**: `calculate()` の結果をそのまま表にする
