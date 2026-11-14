"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { setTaskStatusAction } from "@/app/(app)/actions";
import { useAction } from "./use-action";

export function TaskCheck({ id, done, label }: { id: string; done: boolean; label: string }) {
  const { pending, exec } = useAction();
  return (
    <Checkbox
      checked={done}
      disabled={pending}
      aria-label={`${label}を${done ? "未完了に戻す" : "完了にする"}`}
      onCheckedChange={(v) => exec(() => setTaskStatusAction(id, v ? "done" : "todo"), { silent: true })}
      className="mt-0.5 size-6"
    />
  );
}
