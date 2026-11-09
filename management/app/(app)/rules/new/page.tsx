import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { can } from "@/server/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewRuleForm } from "./new-rule-form";

export const metadata: Metadata = { title: "新しい規定" };

export default async function NewRulePage() {
  if (!(await can("rule.edit"))) notFound();
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">新しい規定</h1>
      <Card>
        <CardHeader><CardTitle>規定の下書き</CardTitle><span className="text-xs text-stone-600">社長の承認後に公開できます</span></CardHeader>
        <CardContent><NewRuleForm /></CardContent>
      </Card>
    </>
  );
}
