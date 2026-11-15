import { RULES, SECTIONS } from "@/lib/import-config";

// 本物の原文は使わない。見出しとルールの書き出しだけを持つ「テスト用の書き出し」を作る
export function fakeExport(): string {
  const out = ["整骨院スタッフ業務・行動マニュアル", ""];
  for (const s of SECTIONS) {
    out.push(s.ref === "S18" ? "1. 接客・説明業務" : "", s.ref >= "S18" ? `• ${s.heading}` : s.heading, "", "行動", `• ${s.ref}のテスト用の行動`);
    for (const r of RULES.filter((x) => x.ref === s.ref)) for (const st of r.starts) out.push(`${st}（${r.code}のテスト文）`, "（続きの行）", "");
    out.push("考え方", `• ${s.ref}のテスト用の考え方`, "", "⸻");
  }
  return out.join("\r\n");
}

