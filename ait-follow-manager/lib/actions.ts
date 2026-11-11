import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthorizationError } from "@/lib/auth/errors";

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

type PgLikeError = { code?: string; message?: string };

/** DB エラーを利用者向けの文言に変換する（内部情報は返さない） */
export function friendlyDbError(e: PgLikeError): string {
  switch (e.code) {
    case "23505":
      return "同じ内容のデータが既に登録されています（顧客番号・コード等の重複）";
    case "23514":
      return e.message && /[ぁ-んァ-ン一-龥]/.test(e.message) ? e.message : "入力内容が正しくありません";
    case "23503":
      return "関連するデータが見つかりません";
    case "42501":
      return "この操作を行う権限がありません";
    case "P0002":
      return "対象のデータが見つかりません";
    default:
      return "処理に失敗しました。時間をおいて再度お試しください";
  }
}

export class UserFacingError extends Error {}

export function throwIfDbError(error: PgLikeError | null | undefined): asserts error is null | undefined {
  if (error) throw new UserFacingError(friendlyDbError(error));
}

/** Server Action の共通ラッパー：認可・検証・DB エラーを利用者向けの結果に変換 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthorizationError || e instanceof UserFacingError) return { error: e.message };
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
      return { error: "入力内容を確認してください", fieldErrors };
    }
    console.error("[action] unexpected error", e instanceof Error ? e.name : typeof e);
    return { error: "処理に失敗しました。時間をおいて再度お試しください" };
  }
}

export function formString(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
