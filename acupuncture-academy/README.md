# 鍼灸臨床アカデミー

鍼灸師が東洋医学の基礎から臨床応用まで、病態と取穴の根拠を段階的に学ぶための日本語 Web アプリ（MVP）。

- 技術：Next.js 16（App Router・静的生成）/ TypeScript / Tailwind CSS v4 / shadcn/ui（Radix UI）
- 保存：localStorage（`src/lib/repository`）。Supabase へは同じインターフェースで差し替え可能（`docs/supabase-schema.sql`）
- 開発計画・画面構成：`docs/PLAN.md`
- 公開手順（Vercel）：`docs/DEPLOY.md`

## 起動

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm run start
npm run lint
npm test         # 教材データの整合性・記録の移行・復習間隔
```

## 教材データ

| ファイル | 内容 |
| --- | --- |
| `src/data/curriculum.ts` | 全10章・37講の一覧 |
| `src/data/lessons/meridian-intro.ts` | 第1章第1講「経絡とは何か」 |
| `src/data/lessons/chapter1.ts` 〜 `chapter10.ts` | 第1〜10章の講義（`helpers.ts` は小テスト作成の補助） |
| `src/data/meridians.ts` | 十二経脈・奇経八脈 |
| `src/data/yaoxue.ts` | 要穴の分類表（五兪穴・原絡郄・兪募・八会・下合・四総）と、要穴の簡易エントリ。辞典の「分類」はここから自動で作る |
| `src/data/points.ts` / `points-key.ts` | 経穴辞典の詳細版（作用・主治・局所解剖まで記載した23穴） |
| `src/data/changelog.ts` | 教材の更新履歴・講義ごとの版・教材データの版 |
| `src/data/symptoms.ts` | 「症状から取穴」のガイド（危険徴候・部位と経絡・証・取穴候補と根拠・評価項目） |
| `src/data/ziwu.ts` | 子午流注（納支法）の刻と経脈、補瀉の穴（五兪穴の表から自動計算） |
| `src/data/eight-confluent.ts` | 八脈交会穴4組 |
| `src/data/cases.ts` / `cases-more.ts` | 架空の症例演習（4例） |
| `src/data/sources.ts` | 出典と照合状態 |
| `src/components/figures/body-geometry.ts` | 人体模式図（仮図）の座標 |

すべての教材は `reviewStatus: "unverified"`（画面上「要確認」）で登録しています。監修者が原典と照合したら `verified` に更新してください。

## 注意

shadcn/ui のレジストリ（ui.shadcn.com）に接続できない環境で構築したため、`src/components/ui` は shadcn/ui の new-york スタイルに沿って手元で作成しています（`components.json` あり。接続可能な環境では `npx shadcn@latest add` で追加できます）。

## 教材を更新するときの手順

1. 教材（`src/data/lessons/*.ts` など）を直す
2. `src/data/changelog.ts` で、直した講義の `revision` を1つ上げ、`updatedAt` と `note` を書く
3. 同じファイルの `changelog` の先頭にその日の更新内容を足し、`contentVersion` を更新日にする
4. `npm test`（版と更新履歴の整合性もチェックされる）→ PR → main にマージ

マージ後に公開されると、その講義を学習済みの人には、ホーム・カリキュラム・講義の画面で「更新あり」が表示されます。画面の一番下に教材データの版（日付）が出るので、最新が公開されたかどうかもそこで確認できます。
