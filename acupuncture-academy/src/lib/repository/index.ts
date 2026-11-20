import { localRepository } from "./local";
import type { LearningRepository } from "./types";

/** 使用する保存層。Supabase 導入時はここを切り替える。 */
export function getRepository(): LearningRepository {
  return localRepository;
}

export * from "./types";
