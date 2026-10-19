import { redirect } from "next/navigation";
import { createOrgAction, signOutAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/app/ActionForm";
import { AuthShell } from "@/components/app/AuthShell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { requireUser } from "@/lib/data";

export const metadata = { title: "企業の作成" };

export default async function OnboardingPage() {
  const { repo, user } = await requireUser();
  if ((await repo.memberships()).length) redirect("/");
  return (
    <AuthShell title="企業を作成" description={`${user.email} でログインしています。管理する企業を作成すると、あなたがオーナーになります。ほかの企業に参加する場合は、その企業のオーナーにメールアドレスで追加してもらってください。`}>
      <ActionForm action={createOrgAction} className="space-y-4">
        <Field label="企業名">
          <Input name="name" required maxLength={100} placeholder="例 株式会社サンプル" />
        </Field>
        <Submit className="w-full">作成する</Submit>
      </ActionForm>
      <form action={signOutAction} className="mt-3 text-center">
        <Button variant="link" type="submit" size="sm">
          ログアウト
        </Button>
      </form>
    </AuthShell>
  );
}

// 利用者ごとのデータ・設定を表示するため、ビルド時に静的生成しない
export const dynamic = "force-dynamic";
