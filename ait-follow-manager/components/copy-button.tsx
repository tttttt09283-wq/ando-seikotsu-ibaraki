"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

/** 文面をクリップボードにコピー（Phase 1 では外部送信しないため、スタッフが別ツールに貼り付ける） */
export function CopyButton({ text, label = "文面をコピー", ...props }: ButtonProps & { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button type="button" onClick={copy} aria-live="polite" {...props}>
      {copied ? <Check /> : <Copy />}
      {copied ? "コピーしました" : label}
    </Button>
  );
}
