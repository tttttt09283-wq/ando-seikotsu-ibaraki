import { ActionForm } from "@/components/ActionForm";
import { Field, Input } from "@/components/ui";
import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium tracking-wide text-brand-600">あんど整骨院グループ</p>
        <h1 className="mb-6 text-lg font-bold">勤怠管理システム ログイン</h1>
        {error === "account" && (
          <p role="alert" className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
            このアカウントは利用できません（未登録または停止中）。本部事務にご連絡ください。
          </p>
        )}
        <ActionForm action={signIn} submitLabel="ログイン" resetOnSuccess={false}>
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field label="メールアドレス">
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="パスワード">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
        </ActionForm>
        <p className="mt-6 text-xs text-slate-500">
          この画面は本部・院長用の管理画面です。出退勤の打刻は各院の共用端末から行ってください。
          パスワードを忘れた場合は本部事務にご連絡ください。
        </p>
      </div>
    </main>
  );
}
