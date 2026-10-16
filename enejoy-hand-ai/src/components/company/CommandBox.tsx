"use client";

import { CornerDownLeft, LoaderCircle, Sparkles } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { COMMANDER_ID, getMember, TENANT } from "@/tenant";
import { useCompany } from "./StateProvider";

export const COMMAND_EXAMPLES = TENANT.commandExamples;

function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // 非HTTPS環境（LAN内のIPアドレスでのアクセス等）では randomUUID が使えないため自前で生成
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 司令塔への指示入力欄 */
export function CommandBox({ onSent, className, autoFocus }: { onSent?: (commandId: string) => void; className?: string; autoFocus?: boolean }) {
  const { mutate, snapshot } = useCompany();
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // 同じ送信の再試行では同じIDを使い、二重登録を防ぐ
  const requestId = React.useRef<string | null>(null);

  const submit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    requestId.current ??= newRequestId();
    const r = await mutate("/api/commands", { text: trimmed, clientRequestId: requestId.current });
    setPending(false);
    if (r.ok) {
      requestId.current = null;
      setText("");
      onSent?.(String(r.data.commandId ?? ""));
    } else {
      setError(r.error);
      // 制限・停止によるエラーは同じ内容の再送でも結果は同じなので、新しいIDで受け付け直す
      requestId.current = null;
    }
  };

  const disabled = pending || snapshot.safety.halted;

  return (
    <div className={cn("rounded-2xl border bg-card p-3 shadow-sm sm:p-4", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
      >
        <label htmlFor="commander-command" className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <span className="bg-brand text-brand-foreground grid size-6 place-items-center rounded-full">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          司令塔（{getMember(COMMANDER_ID)?.name}）への指示
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            id="commander-command"
            value={text}
            maxLength={500}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit(text);
              }
            }}
            placeholder="例：MISSION 001を進めて"
            className="min-h-12 resize-none text-base"
            disabled={disabled}
          />
          <Button type="submit" variant="brand" size="lg" disabled={disabled || !text.trim()} className="sm:h-12">
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <CornerDownLeft aria-hidden />}
            指示する
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {COMMAND_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={disabled}
            onClick={() => void submit(ex)}
            className="bg-secondary hover:bg-accent text-secondary-foreground shrink-0 rounded-full px-3 py-1 text-xs transition disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
