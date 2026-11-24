/**
 * Supabase 実装の雛形（未接続）。
 *
 * 導入手順（予定）:
 * 1. `npm i @supabase/supabase-js` を追加
 * 2. 環境変数 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を設定
 * 3. docs/supabase-schema.sql のテーブルと RLS（本人の行だけ読める・書ける）を作成
 * 4. 下記の TODO を実装し、src/lib/repository/index.ts で createSupabaseRepository() を返す
 * 5. 初回ログイン時に localRepository の内容をアップロードする移行処理を入れる
 *
 * 患者の個人情報は保存しない（学習記録のみ）。
 */
import type { LearningRepository, LearningState } from "./types";

export function createSupabaseRepository(): LearningRepository {
  return {
    label: "クラウド（Supabase）",
    async load(): Promise<LearningState> {
      throw new Error("Supabase 連携は未実装です（src/lib/repository/supabase.ts）");
    },
    async save() {
      throw new Error("Supabase 連携は未実装です");
    },
    async clear() {
      throw new Error("Supabase 連携は未実装です");
    },
  };
}
