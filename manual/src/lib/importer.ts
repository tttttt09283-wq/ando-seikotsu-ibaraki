// 既存マニュアルの書き出し（プレーンテキスト）を項目に分ける。文言は一字も変えない（行末の空白と改行コードだけそろえる）。
import crypto from "node:crypto";
import { CHAPTER_LINE, RULES, SECTIONS, type RuleConfig } from "./import-config";

export type ParsedSection = { ref: string; heading: string; text: string };
export type ParsedRule = RuleConfig & { text: string; missing: string[] };
export type ParseResult = {
  sections: ParsedSection[];
  rules: ParsedRule[];
  missingSections: string[];
  duplicateHeadings: string[];
  sha256: string;
};

export const normalizeHeading = (line: string) =>
  line.trim().replace(/^[•⸻\s]+/, "").replace(/^【(.*)】$/, "$1").trim();

const isSeparator = (line: string) => /^⸻\s*$/.test(line.trim());

// 行の続き：空行・記号（⭐ • ※ 「 ・ 【）で始まる行・見出しが来たら終わり
const STOP = /^(⭐|•|※|「|・|【|⸻)/;

export function parseManual(raw: string): ParseResult {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").map((l) => l.replace(/[ \t ]+$/, ""));
  const byHeading = new Map(SECTIONS.map((s) => [s.heading, s]));
  const starts: { index: number; ref: string; heading: string }[] = [];
  const seen = new Set<string>();
  const duplicateHeadings: string[] = [];
  lines.forEach((line, index) => {
    const h = normalizeHeading(line);
    const cfg = byHeading.get(h);
    if (!cfg) return;
    if (seen.has(cfg.ref)) { duplicateHeadings.push(cfg.heading); return; }
    seen.add(cfg.ref);
    starts.push({ index, ref: cfg.ref, heading: cfg.heading });
  });
  starts.sort((a, b) => a.index - b.index);

  const sections: ParsedSection[] = starts.map((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const body: string[] = [];
    for (let j = s.index + 1; j < end; j++) {
      if (CHAPTER_LINE.test(lines[j].trim())) break; // 次の章の見出し
      if (isSeparator(lines[j])) continue;
      body.push(lines[j]);
    }
    while (body.length && !body[0].trim()) body.shift();
    while (body.length && !body[body.length - 1].trim()) body.pop();
    return { ref: s.ref, heading: s.heading, text: body.join("\n").replace(/\n{3,}/g, "\n\n") };
  });

  const sectionByRef = new Map(sections.map((s) => [s.ref, s]));
  const rules: ParsedRule[] = RULES.map((r) => {
    const sec = sectionByRef.get(r.ref);
    const secLines = sec ? sec.text.split("\n") : [];
    const picked: string[] = [];
    const missing: string[] = [];
    for (const st of r.starts) {
      const i = secLines.findIndex((l) => l.trim().startsWith(st));
      if (i < 0) { missing.push(st); continue; }
      picked.push(secLines[i].trim());
      for (let j = i + 1; j < secLines.length; j++) {
        const l = secLines[j].trim();
        if (!l || STOP.test(l) || r.starts.some((x) => l.startsWith(x))) break;
        picked.push(l);
      }
    }
    return { ...r, text: picked.join("\n"), missing };
  });

  return {
    sections,
    rules,
    missingSections: SECTIONS.filter((s) => !sectionByRef.has(s.ref)).map((s) => `${s.ref} ${s.heading}`),
    duplicateHeadings,
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
  };
}
