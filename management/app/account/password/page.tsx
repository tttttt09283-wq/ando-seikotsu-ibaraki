import type { Metadata } from "next";
import { requireMe } from "@/server/session";
import { Alert } from "@/components/ui/alert";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "PASSの変更" };

export default async function PasswordPage() {
  const me = await requireMe();
  return (
    <main className="mx-auto grid max-w-sm gap-5 px-4 py-10">
      <h1 className="text-lg font-black text-brand-800">PASSの変更</h1>
      {me.must_change_password ? <Alert tone="warn">発行されたPASSでログインしました。ご自身のPASSに変更してから使い始めてください。</Alert> : null}
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><PasswordForm /></div>
    </main>
  );
}
