import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Server Action の共通処理：入力検証エラー・例外を日本語メッセージで返し、画面を再計算させる */
export async function run<T>(fn: () => Promise<T>, opts: { message?: string; revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    return { ok: true, data, message: opts.message };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      return { ok: false, error: `入力内容を確認してください：${first?.path.join(".") || ""} ${first?.message ?? ""}`.trim() };
    }
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "保存に失敗しました" };
  }
}
