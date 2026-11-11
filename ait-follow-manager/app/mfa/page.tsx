import { verifyMfa } from "@/app/auth-actions";
import { CenteredCard } from "@/components/brand";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";

export const metadata = { title: "2段階認証" };

/** 管理者ロールは TOTP による2段階認証が必須。未登録なら登録用 QR コードを表示する */
export default async function MfaPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.find((f) => f.status === "verified");

  if (verified) {
    return (
      <CenteredCard title="2段階認証">
        <p className="mb-4 text-sm text-muted-foreground">認証アプリに表示されている6桁のコードを入力してください。</p>
        <ActionForm action={verifyMfa}>
          <input type="hidden" name="factorId" value={verified.id} />
          <Field label="確認コード" htmlFor="code">
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
          </Field>
          <SubmitButton className="w-full">確認する</SubmitButton>
        </ActionForm>
      </CenteredCard>
    );
  }

  // 未完了の登録は削除してから新規登録（QR を毎回作り直す）
  for (const f of factors?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enroll, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "A.I.T Follow Manager" });
  if (error || !enroll) {
    return (
      <CenteredCard title="2段階認証の設定">
        <p className="text-sm text-danger">2段階認証の設定を開始できませんでした。時間をおいて再度お試しください。</p>
      </CenteredCard>
    );
  }
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(enroll.totp.qr_code)}`;

  return (
    <CenteredCard title="2段階認証の設定">
      <p className="mb-3 text-sm text-muted-foreground">
        管理者アカウントには2段階認証が必要です。認証アプリ（Google Authenticator 等）で QR コードを読み取り、表示された6桁のコードを入力してください。
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt="2段階認証の QR コード" className="mx-auto size-48" />
      <p className="mt-2 break-all text-center text-xs text-muted-foreground">手動入力用キー：{enroll.totp.secret}</p>
      <ActionForm action={verifyMfa} className="mt-4">
        <input type="hidden" name="factorId" value={enroll.id} />
        <Field label="確認コード" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </Field>
        <SubmitButton className="w-full">登録する</SubmitButton>
      </ActionForm>
    </CenteredCard>
  );
}
