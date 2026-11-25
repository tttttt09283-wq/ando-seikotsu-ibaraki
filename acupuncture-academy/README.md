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
| `src/data/curriculum.ts` | 全10章・講義一覧 |
| `src/data/lessons/meridian-intro.ts` | 第1章第1講「経絡とは何か」 |
| `src/data/lessons/chapter1.ts` 〜 `chapter4.ts` | 第1〜4章の講義 |
| `src/data/meridians.ts` | 十二経脈・奇経八脈 |
| `src/data/points.ts` / `points-key.ts` | 経穴辞典（八脈交会穴8穴＋要穴15穴） |
| `src/data/eight-confluent.ts` | 八脈交会穴4組 |
| `src/data/cases.ts` / `cases-more.ts` | 架空の症例演習（4例） |
| `src/data/sources.ts` | 出典と照合状態 |
| `src/components/figures/body-geometry.ts` | 人体模式図（仮図）の座標 |

すべての教材は `reviewStatus: "unverified"`（画面上「要確認」）で登録しています。監修者が原典と照合したら `verified` に更新してください。

## 注意

shadcn/ui のレジストリ（ui.shadcn.com）に接続できない環境で構築したため、`src/components/ui` は shadcn/ui の new-york スタイルに沿って手元で作成しています（`components.json` あり。接続可能な環境では `npx shadcn@latest add` で追加できます）。
