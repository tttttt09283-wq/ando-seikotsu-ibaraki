"use client";
import { useActionState, useState } from "react";
import { loginClinic, loginEmail, loginPerson } from "@/app/actions";
import { btn, input, label } from "@/components/ui";

type ClinicState = Awaited<ReturnType<typeof loginClinic>> | undefined;

export function LoginForms() {
  const [tab, setTab] = useState<"staff" | "email">("staff");
  const [clinic, clinicAction, clinicPending] = useActionState<ClinicState, FormData>(loginClinic, undefined);
  const [person, personAction, personPending] = useActionState(loginPerson, undefined);
  const [email, emailAction, emailPending] = useActionState(loginEmail, undefined);
  const step2 = clinic?.step === "person" ? clinic : null;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 rounded-lg border border-navy p-0.5 text-sm font-bold" role="tablist">
        {(["staff", "email"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-md py-2 ${tab === t ? "bg-navy text-white" : "text-navy"}`}>
            {t === "staff" ? "スタッフ（院ID）" : "管理職（メール）"}
          </button>
        ))}
      </div>

      {tab === "staff" && !step2 && (
        <form action={clinicAction} className="space-y-3">
          <div>
            <label className={label} htmlFor="id">院ID</label>
            <input id="id" name="id" className={input} autoCapitalize="none" autoComplete="username" required placeholder="例：ibaraki" />
          </div>
          <div>
            <label className={label} htmlFor="pass">院PASS（数字4桁）</label>
            <input id="pass" name="pass" className={input} inputMode="numeric" type="password" autoComplete="current-password" required maxLength={4} />
          </div>
          {clinic?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{clinic.error}</p>}
          <button className={`${btn} w-full`} disabled={clinicPending}>{clinicPending ? "確認中…" : "次へ"}</button>
          <p className="text-xs leading-relaxed text-neutral-500">予約管理と同じ院ID・院PASS・個人PASSです。院長・BM・GM・社長の方は、承認や編集のために「管理職（メール）」でログインしてください。</p>
        </form>
      )}

      {tab === "staff" && step2 && (
        <form action={personAction} className="space-y-3">
          <p className="text-sm font-bold text-navy">{step2.clinic}院</p>
          <input type="hidden" name="clinicToken" value={step2.clinicToken} />
          <div>
            <label className={label} htmlFor="personKey">名前</label>
            <select id="personKey" name="personKey" className={input} required defaultValue="">
              <option value="" disabled>選んでください</option>
              {step2.staff.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ppass">個人PASS</label>
            <input id="ppass" name="pass" className={input} type="password" autoComplete="current-password" required />
          </div>
          {person?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{person.error}</p>}
          <button className={`${btn} w-full`} disabled={personPending}>{personPending ? "確認中…" : "ログイン"}</button>
          <button type="button" className="w-full text-center text-sm text-navy underline" onClick={() => window.location.reload()}>院IDからやり直す</button>
        </form>
      )}

      {tab === "email" && (
        <form action={emailAction} className="space-y-3">
          <div>
            <label className={label} htmlFor="email">メールアドレス</label>
            <input id="email" name="email" type="email" className={input} autoComplete="email" required />
          </div>
          <div>
            <label className={label} htmlFor="password">パスワード</label>
            <input id="password" name="password" type="password" className={input} autoComplete="current-password" required />
          </div>
          {email?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800">{email.error}</p>}
          <button className={`${btn} w-full`} disabled={emailPending}>{emailPending ? "確認中…" : "ログイン"}</button>
          <p className="text-xs text-neutral-500">予約管理と同じメールアドレス・パスワードです。</p>
        </form>
      )}
    </div>
  );
}
