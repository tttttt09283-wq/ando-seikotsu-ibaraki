import Link from "next/link";
import { AuthForm } from "@/components/app/AuthForm";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { appMode } from "@/lib/config";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  if (appMode() === "demo") {
    return (
      <AuthShell title="デモモードで動いています" description="Supabase が設定されていないため、ログインなしで架空のデモデータを表示します。実際の企業データは扱えません。">
        <div className="space-y-3 text-sm">
          <Button asChild className="w-full">
            <Link href="/">デモを見る</Link>
          </Button>
          <p className="text-muted-foreground text-xs">本番で使うには、README の手順で Supabase を設定してください（設定するとログインが必須になります）。</p>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="ログイン">
      {sp.error === "confirm" && <p className="text-bad mb-3 text-sm">確認リンクが無効か期限切れです。もう一度ログインするか、登録をやり直してください。</p>}
      <AuthForm mode="login" />
      <p className="text-muted-foreground mt-4 text-center text-sm">
        はじめての方は
        <Link href="/signup" className="text-brand font-medium hover:underline">
          新規登録
        </Link>
      </p>
    </AuthShell>
  );
}

// 利用者ごとのデータ・設定を表示するため、ビルド時に静的生成しない
export const dynamic = "force-dynamic";
