import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/server/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "スタッフ登録" };

export default async function NewUserPage() {
  if (!(await can("master.manage"))) notFound();
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name").eq("is_active", true).order("display_order");
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">スタッフ登録・ID/PASS発行</h1>
      <Card><CardHeader><CardTitle>基本情報</CardTitle></CardHeader><CardContent><RegisterForm stores={stores ?? []} /></CardContent></Card>
    </>
  );
}
