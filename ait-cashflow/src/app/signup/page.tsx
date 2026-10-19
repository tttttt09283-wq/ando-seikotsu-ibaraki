import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/app/AuthForm";
import { AuthShell } from "@/components/app/AuthShell";
import { appMode } from "@/lib/config";

export const metadata = { title: "新規登録" };

export default function SignupPage() {
  if (appMode() === "demo") redirect("/login");
  return (
    <AuthShell title="新規登録" description="登録後に届く確認メールのリンクを開くと、ログインできるようになります。">
      <AuthForm mode="signup" />
      <p className="text-muted-foreground mt-4 text-center text-sm">
        登録済みの方は
        <Link href="/login" className="text-brand font-medium hover:underline">
          ログイン
        </Link>
      </p>
    </AuthShell>
  );
}

// 利用者ごとのデータ・設定を表示するため、ビルド時に静的生成しない
export const dynamic = "force-dynamic";
