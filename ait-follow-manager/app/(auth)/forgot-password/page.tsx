import Link from "next/link";
import { requestPasswordReset } from "@/app/auth-actions";
import { CenteredCard } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";

export const metadata = { title: "パスワード再設定" };

export default function ForgotPasswordPage() {
  return (
    <CenteredCard title="パスワード再設定">
      <p className="mb-4 text-sm text-muted-foreground">登録済みのメールアドレスに、再設定用のリンクをお送りします。</p>
      <ActionForm action={requestPasswordReset}>
        <Field label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full">送信する</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          ログインに戻る
        </Link>
      </p>
    </CenteredCard>
  );
}
