"use client";
import { useActionState } from "react";
import Link from "next/link";
import { registerUser, type IssueState } from "../actions";
import { Input, Select, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { IssuedCredentials } from "@/components/issued-credentials";

export function RegisterForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [state, action] = useActionState<IssueState, FormData>(registerUser, {});
  if (state.issued) {
    return (
      <div className="grid gap-3">
        <IssuedCredentials {...state.issued} />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/admin/users/${state.issued.userId}`}>この人の詳細へ</Link></Button>
          <Button asChild variant="ghost"><Link href="/admin/users/new">続けて登録</Link></Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.error ? <Alert tone="danger" className="sm:col-span-2">{state.error}</Alert> : null}
      <Field label="氏名"><Input name="name" required maxLength={40} placeholder="例：田中 太郎" /></Field>
      <Field label="ふりがな"><Input name="name_kana" maxLength={60} /></Field>
      <Field label="スタッフID" hint="CSV移行の照合に使う番号（半角英数字）"><Input name="staff_code" required className="font-mono" placeholder="A001" /></Field>
      <Field label="ログインID" hint="半角英小文字・数字。POSで使っているIDならそのアカウントに紐づけます"><Input name="login_id" required className="font-mono" autoCapitalize="none" placeholder="tanaka" /></Field>
      <Field label="雇用区分">
        <Select name="employment_type" defaultValue="正社員">
          {["正社員", "短時間正社員", "アルバイト", "役員"].map((v) => <option key={v}>{v}</option>)}
        </Select>
      </Field>
      <Field label="入社日" hint="有給の付与（入社日基準）に使います"><Input name="hire_date" type="date" /></Field>
      <Field label="主所属の院">
        <Select name="store_id" defaultValue="">
          <option value="">（あとで設定）</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label="院での役職">
        <Select name="store_role" defaultValue="STAFF">
          <option value="STAFF">一般スタッフ</option><option value="MANAGER">院長</option><option value="PART_TIMER">アルバイト</option>
        </Select>
      </Field>
      <Field label="POSのスタッフ番号" hint="POSに登録のある人だけ（任意）"><Input name="pos_staff_id" type="number" min={1} /></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-bold"><input type="checkbox" name="reissue" className="size-5" />POSで使っているIDの場合も、PASSを新しく発行する</label>
      <div className="sm:col-span-2"><SubmitButton pendingText="発行中…">登録してID・PASSを発行</SubmitButton></div>
    </form>
  );
}
