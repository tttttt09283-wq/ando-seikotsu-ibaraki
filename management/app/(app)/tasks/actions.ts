"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-error";
import { back } from "@/server/redirect-with";

const backTo = (fd: FormData) => { const b = String(fd.get("back_to") || "/tasks"); return b.startsWith("/") ? b : "/tasks"; };

export async function updateTaskProgress(fd: FormData) {
  const status = String(fd.get("status"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_task_progress", {
    p_id: Number(fd.get("id")), p_status: status, p_progress: Number(fd.get("progress") ?? 0), p_note: String(fd.get("note") ?? "") || null,
  });
  if (error) back(backTo(fd), "err", friendlyDbError(error));
  revalidatePath("/tasks");
  back(backTo(fd), "ok", status === "done" ? "完了にしました" : "進み具合を更新しました");
}

export async function createTask(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_task", {
    p_store: String(fd.get("store_id")), p_title: String(fd.get("title") ?? ""), p_detail: String(fd.get("detail") ?? "") || null,
    p_owner: String(fd.get("owner_user_id") || "") || null, p_due: String(fd.get("due_date") || "") || null, p_priority: String(fd.get("priority") || "mid"),
  });
  if (error) back(backTo(fd), "err", friendlyDbError(error));
  revalidatePath("/tasks");
  back(backTo(fd), "ok", "タスクを登録しました（担当者に通知しました）");
}

export async function deleteTask(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_task", { p_id: Number(fd.get("id")) });
  if (error) back(backTo(fd), "err", friendlyDbError(error));
  revalidatePath("/tasks");
  back(backTo(fd), "ok", "タスクを削除しました");
}
