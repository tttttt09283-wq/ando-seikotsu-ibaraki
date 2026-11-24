import { Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProvisionalFigureNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md border border-verify/30 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-verify", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        仮の模式図です。伝統理論上の経絡の走行を示すもので、解剖学的に正確な人体図ではありません。神経・血管の走行とは異なります。
      </span>
    </p>
  );
}

export function EducationNotice({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground", className)}>
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        本アプリは鍼灸師の学習用教材です。内容は監修前のものを含みます（「要確認」表示）。実際の施術判断は、資格者の責任のもと最新の教科書・ガイドラインと所属機関の方針に従ってください。
      </span>
    </p>
  );
}

export function FictionalCaseNotice({ text, className }: { text?: string; className?: string }) {
  return (
    <p className={cn("rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground", className)}>
      {text ?? "教育用の架空症例です。実在の患者情報は含みません。"}
    </p>
  );
}
