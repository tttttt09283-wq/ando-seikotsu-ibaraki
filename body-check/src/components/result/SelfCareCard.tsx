"use client";

import { useState } from "react";
import { CHECK_META } from "@/config/checks";
import type { SelfCareItem } from "@/config/selfcare";
import { CheckIllustration } from "@/components/Illustrations";
import { Card } from "@/components/ui";

/** YouTube の埋め込みURLだけを許可する（安全のため） */
function safeVideoUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const allowed = ["www.youtube.com", "www.youtube-nocookie.com"];
    return u.protocol === "https:" && allowed.includes(u.hostname) && u.pathname.startsWith("/embed/") ? u.toString() : null;
  } catch {
    return null;
  }
}

export function SelfCareCard({ item, index }: { item: SelfCareItem; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const video = safeVideoUrl(item.videoUrl);
  const panelId = `selfcare-${item.id}`;

  return (
    <Card className="p-0">
      <h3>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <CheckIllustration id={item.category} className="size-14 shrink-0" />
          <span className="flex-1">
            <span className="block text-xs font-bold text-brand-700">
              おすすめ{index + 1}｜{CHECK_META[item.category].shortName}
            </span>
            <span className="block text-lg font-black leading-snug">{item.name}</span>
            <span className="mt-1 inline-block rounded-full bg-sun-100 px-2 py-0.5 text-xs font-bold text-navy-900">{item.amount}</span>
          </span>
          <span aria-hidden="true" className={`text-brand-600 transition ${open ? "rotate-180" : ""}`}>
            ▼
          </span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-brand-100 px-5 pb-5 pt-4 text-base leading-relaxed">
          <div>
            <h4 className="text-sm font-black text-brand-700">目的</h4>
            <p>{item.purpose}</p>
          </div>
          {video && (
            <div className="aspect-video overflow-hidden rounded-2xl bg-slate-100">
              <iframe
                src={video}
                title={`${item.name}の動画`}
                className="size-full"
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          <div>
            <h4 className="text-sm font-black text-brand-700">やりかた</h4>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              {item.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="text-sm font-black text-brand-700">回数・時間</h4>
            <p>{item.amount}</p>
          </div>
          <div className="rounded-2xl bg-sun-100 p-3">
            <h4 className="text-sm font-black">⚠️ 注意点</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {item.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
              <li>痛みや違和感が出たら、すぐに中止してください。</li>
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
