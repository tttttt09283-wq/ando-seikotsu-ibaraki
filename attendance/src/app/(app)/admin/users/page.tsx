import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { ROLE_LABELS, grantableRoles } from "@/lib/auth/permissions";
import { isActiveOn, staffName, type AccountRow, type ClinicRow, type RoleGrantRow, type StaffRow } from "@/lib/data/types";
import { todayJst } from "@/lib/time/jst";
import { createAccount, endRole, grantRole, resetPassword, setAccountDisabled } from "./actions";

export default async function UsersPage() {
  const actor = await requireHq();
  const supabase = await createSupabaseServer();
  const today = todayJst();

  const [{ data: accountData }, { data: roleData }, { data: clinicData }, { data: staffData }] = await Promise.all([
    supabase.from("app_accounts").select("*").order("created_at"),
    supabase.from("user_roles").select("*").order("valid_from", { ascending: false }),
    supabase.from("clinics").select("clinic_id, name, status").order("display_order"),
    supabase.from("staff_profiles").select("staff_id, staff_code, family_name, given_name, auth_user_id").neq("status", "retired"),
  ]);
  const accounts = (accountData ?? []) as AccountRow[];
  const roles = (roleData ?? []) as RoleGrantRow[];
  const clinics = (clinicData ?? []) as Pick<ClinicRow, "clinic_id" | "name" | "status">[];
  const clinicName = new Map(clinics.map((c) => [c.clinic_id, c.name]));
  const staff = (staffData ?? []) as Pick<StaffRow, "staff_id" | "staff_code" | "family_name" | "given_name" | "auth_user_id">[];
  const staffByUser = new Map(staff.filter((s) => s.auth_user_id).map((s) => [s.auth_user_id as string, s]));
  const unlinkedStaff = staff.filter((s) => !s.auth_user_id);
  const roleOptions = grantableRoles(actor);

  return (
    <>
      <PageHeader
        title="アカウント・権限"
        description="管理画面にログインする本部・院長のアカウントとロールを管理します。院長ロールは院ごとに付与します（兼務は複数付与）。"
      />

      <div className="space-y-6">
        {accounts.length === 0 && <EmptyState>アカウントがありません</EmptyState>}
        {accounts.map((account) => {
          const grants = roles.filter((r) => r.user_id === account.user_id);
          const linked = staffByUser.get(account.user_id);
          return (
            <Card key={account.user_id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="font-bold">{account.display_name}</h2>
                <span className="text-sm text-slate-600">{account.email}</span>
                {account.disabled && <Badge tone="red">停止中</Badge>}
                {linked && (
                  <Badge tone="blue">
                    スタッフ：{staffName(linked)}（{linked.staff_code}）
                  </Badge>
                )}
              </div>

              <ul className="mb-4 space-y-2 text-sm">
                {grants.length === 0 && <li className="text-slate-500">ロールが付与されていません（ログインしても操作できません）</li>}
                {grants.map((g) => {
                  const active = isActiveOn(g, today);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-3">
                      <Badge tone={active ? "green" : "gray"}>{ROLE_LABELS[g.role]}</Badge>
                      {g.clinic_id && <span>{clinicName.get(g.clinic_id)}</span>}
                      <span className="text-slate-500">
                        {g.valid_from} 〜 {g.valid_to ?? ""}
                      </span>
                      {(g.valid_to === null || g.valid_to >= today) && roleOptions.includes(g.role) && (
                        <ActionForm action={endRole} submitLabel="終了" tone="secondary" className="flex gap-2">
                          <input type="hidden" name="role_grant_id" value={g.id} />
                          <Input name="valid_to" type="date" defaultValue={today} aria-label="ロール終了日" className="w-36" required />
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>

              <details className="text-sm">
                <summary className="cursor-pointer text-brand-700">ロール付与・パスワード再設定・停止</summary>
                <div className="mt-4 grid gap-6 lg:grid-cols-3">
                  <ActionForm action={grantRole} submitLabel="ロールを付与">
                    <input type="hidden" name="user_id" value={account.user_id} />
                    <Field label="ロール">
                      <Select name="role" required defaultValue="clinic_manager">
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="担当院" hint="院長ロールのときのみ指定">
                      <Select name="clinic_id" defaultValue="">
                        <option value="">（指定なし）</option>
                        {clinics
                          .filter((c) => c.status !== "closed")
                          .map((c) => (
                            <option key={c.clinic_id} value={c.clinic_id}>
                              {c.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="開始日">
                      <Input name="valid_from" type="date" defaultValue={today} required />
                    </Field>
                  </ActionForm>

                  <ActionForm action={resetPassword} submitLabel="パスワードを再設定">
                    <input type="hidden" name="user_id" value={account.user_id} />
                    <Field label="新しいパスワード" hint="10文字以上">
                      <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
                    </Field>
                  </ActionForm>

                  {account.user_id !== actor.userId && (
                    <ActionForm
                      action={setAccountDisabled}
                      submitLabel={account.disabled ? "アカウントを再開" : "アカウントを停止"}
                      tone={account.disabled ? "secondary" : "danger"}
                      confirmMessage={account.disabled ? "アカウントを再開します。" : "このアカウントはログインできなくなります。よろしいですか？"}
                    >
                      <input type="hidden" name="user_id" value={account.user_id} />
                      <input type="hidden" name="disabled" value={account.disabled ? "false" : "true"} />
                      <p className="text-slate-600">停止中はログインできず、ロールも無効として扱われます。</p>
                    </ActionForm>
                  )}
                </div>
              </details>
            </Card>
          );
        })}

        <Card title="アカウントを作成">
          <ActionForm action={createAccount} submitLabel="作成" className="grid gap-4 sm:grid-cols-2">
            <Field label="メールアドレス（ログインID）">
              <Input name="email" type="email" autoComplete="off" required />
            </Field>
            <Field label="表示名">
              <Input name="display_name" required />
            </Field>
            <Field label="初期パスワード" hint="10文字以上。本人に安全な方法で伝えてください">
              <Input name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="スタッフとの紐付け" hint="院長など、スタッフ本人のアカウントの場合に選択">
              <Select name="staff_id" defaultValue="">
                <option value="">（紐付けない）</option>
                {unlinkedStaff.map((s) => (
                  <option key={s.staff_id} value={s.staff_id}>
                    {s.staff_code} {staffName(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
