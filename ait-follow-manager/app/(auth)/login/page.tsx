import Link from "next/link";
import { signIn } from "@/app/auth-actions";
import { CenteredCard } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";

export const metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <CenteredCard title="ログイン">
      <ActionForm action={signIn}>
        <Field label="メールアドレス" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="パスワード" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <SubmitButton className="mt-2 w-full" size="lg">
          ログイン
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
          パスワードをお忘れの方
        </Link>
      </p>
    </CenteredCard>
  );
}
