import { redirect } from "next/navigation";
import { dataMode } from "@/lib/server/env";

export const metadata = { title: "初期設定が必要です" };
export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (dataMode() !== "unconfigured") redirect("/");
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-bold">データベースの設定が必要です</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        本番環境では Supabase の接続情報が必要です。Vercel の Environment Variables に次の2つを設定して、再デプロイしてください。
      </p>
      <ul className="bg-muted rounded-lg p-4 font-mono text-sm">
        <li>NEXT_PUBLIC_SUPABASE_URL</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
      </ul>
      <p className="text-muted-foreground text-sm">手順は README.md の「Supabase の設定」「Vercel へのデプロイ」を参照してください。</p>
    </div>
  );
}
