"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/errors";

export type BulkKind = "attendance_adjustment" | "leave" | "holiday_credit";

export interface BulkResult {
  ok: boolean;
  message: string;
  failed: { id: string; message: string }[];
}

const schema = z.object({
  kind: z.enum(["attendance_adjustment", "leave", "holiday_credit"]),
  ids: z.array(z.uuid()).min(1, "承認する申請を選んでください").max(200, "一度に承認できるのは200件までです"),
  comment: z.string().trim().max(500).optional(),
});

/** 選んだ申請をまとめて本部承認する（1件ずつ承認履歴を残し、失敗した分だけ理由を返す） */
export async function bulkApprove(kind: BulkKind, ids: string[], comment: string): Promise<BulkResult> {
  await requireHq();
  const parsed = schema.safeParse({ kind, ids, comment: comment || undefined });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が正しくありません", failed: [] };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("bulk_approve", {
    p_kind: parsed.data.kind,
    p_ids: parsed.data.ids,
    p_comment: parsed.data.comment ?? null,
  });
  if (error) return { ok: false, message: toUserMessage(error), failed: [] };
  const r = data as { approved: number; failed: { id: string; message: string }[] };
  revalidatePath("/hq", "layout");
  revalidatePath("/manager", "layout");
  return {
    ok: r.failed.length === 0,
    message: r.failed.length ? `${r.approved}件を承認しました。${r.failed.length}件は承認できませんでした` : `${r.approved}件を承認しました`,
    failed: r.failed,
  };
}
