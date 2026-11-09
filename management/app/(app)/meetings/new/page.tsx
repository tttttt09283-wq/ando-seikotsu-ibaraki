import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storesWith } from "@/server/meetings";
import { jstToday } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewMeetingForm } from "./new-meeting-form";

export const metadata: Metadata = { title: "会議の登録" };

export default async function NewMeetingPage() {
  const stores = await storesWith("meeting.manage");
  if (!stores.length) notFound();
  return (
    <>
      <h1 className="text-xl font-black text-brand-800">会議の登録</h1>
      <Card>
        <CardHeader><CardTitle>会議の予定</CardTitle></CardHeader>
        <CardContent><NewMeetingForm stores={stores} today={jstToday()} /></CardContent>
      </Card>
    </>
  );
}
