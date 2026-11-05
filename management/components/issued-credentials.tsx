"use client";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// 発行したID・PASSを1回だけ表示する（画面を離れると二度と表示されない）
export function IssuedCredentials({ name, loginId, password, linkedExisting }: { name: string; loginId: string; password: string | null; linkedExisting: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = `${name} さん\nログインID：${loginId}\nPASS：${password ?? "（POSと同じPASS）"}\n初回ログイン後にPASSを変更してください。`;
  return (
    <div className="grid gap-3 rounded-xl border-2 border-green-600 bg-green-50 p-4">
      <p className="font-bold text-green-900">{name} さんを登録しました{linkedExisting ? "（POSで使っているIDに紐づけました）" : ""}</p>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-base">
        <dt className="text-stone-600">ログインID</dt><dd className="font-mono font-bold">{loginId}</dd>
        <dt className="text-stone-600">PASS</dt>
        <dd className="font-mono text-lg font-black tracking-wider">{password ?? <span className="text-sm font-bold">POSと同じPASSのまま</span>}</dd>
      </dl>
      {password ? <Alert tone="warn">このPASSはこの画面でしか表示されません。本人に直接伝えてください（LINEやメールに残さないことをおすすめします）。初回ログイン時にPASSの変更を求めます。POSのPASSも同じものに変わります。</Alert> : null}
      <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "コピーしました" : "IDとPASSをコピー"}</Button>
    </div>
  );
}
