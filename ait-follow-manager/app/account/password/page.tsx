import Link from "next/link";
import { updatePassword } from "@/app/auth-actions";
import { CenteredCard } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/context";

export const metadata = { title: "パスワード設定" };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <CenteredCard title="パスワードの設定">
      <p className="mb-4 text-sm text-muted-foreground">{user.email} のパスワードを設定します。10文字以上で、英大文字・英小文字・数字を含めてください。</p>
      <ActionForm action={updatePassword}>
        <Field label="新しいパスワード" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <Field label="新しいパスワード（確認）" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </Field>
        <SubmitButton className="w-full">設定する</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/select-org" className="text-primary hover:underline">
          アプリに戻る
        </Link>
      </p>
    </CenteredCard>
  );
}
