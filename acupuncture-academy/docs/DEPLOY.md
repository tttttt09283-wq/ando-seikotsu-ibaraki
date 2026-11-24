# 公開手順（Vercel）

このアプリはリポジトリ内の `acupuncture-academy/` にある独立した Next.js アプリです。
既存の予約サイト（リポジトリ直下）や本部システム（`hq/`）とは **別の Vercel プロジェクト** として公開します。

## 1. Vercel プロジェクトを作る（初回のみ）

1. Vercel のダッシュボードで「Add New… → Project」を選び、このリポジトリをインポートする
2. **Root Directory** に `acupuncture-academy` を指定する（ここが最重要）
3. Framework Preset は「Next.js」（自動判定される）
4. Build Command・Output Directory・Install Command は既定のまま
5. 環境変数は不要（学習記録はブラウザ内に保存するため）
6. 「Deploy」を押す

> Node.js のバージョンは 20 以上（Next.js 16 の要件）。プロジェクト設定の「Node.js Version」で確認する。

## 2. 公開範囲を決める

- 院内・関係者だけで使う場合は、プロジェクト設定の **Deployment Protection**（Vercel Authentication またはパスワード保護）を有効にする
- 教材はすべて「要確認（未監修）」の段階のため、一般公開する場合は監修体制が整ってからにすることを推奨

## 3. 公開前の確認

```bash
cd acupuncture-academy
npm install
npm test        # 教材データの整合性・記録の移行・復習間隔のテスト
npm run lint
npm run build
```

公開後は次の画面が開けることを確認する：`/`、`/curriculum`、`/lessons/c1-l1`、`/meridians`、`/points`、`/eight-confluent`、`/cases`、`/progress`。

## 4. 既存プロジェクトへの影響について

- リポジトリ直下の `.vercelignore` はすべての Vercel プロジェクトに効くため、`acupuncture-academy` をそこで除外しないこと（除外するとこのアプリのデプロイが空になる。`hq/` と同じ扱い）
- そのため、既存の予約サイトのデプロイにも `acupuncture-academy/` のソースファイルが静的ファイルとして含まれる。機密情報は含まないが、気になる場合は予約サイト側の `vercel.json` で `/acupuncture-academy/(.*)` をトップへリダイレクトする（`hq/` と同じ方式）

## 5. 将来：ログインと学習記録の同期（Supabase）

`docs/supabase-schema.sql` のテーブルを作成し、`src/lib/repository/supabase.ts` を実装したうえで、
`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel の環境変数に設定する。
