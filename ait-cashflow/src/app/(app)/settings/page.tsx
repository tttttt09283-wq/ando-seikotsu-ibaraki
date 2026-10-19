import {
  addMemberAction,
  removeMemberAction,
  saveAccountAction,
  saveBranchAction,
  saveSnapshotAction,
  setMemberRoleAction,
  updateOrgAction,
} from "@/app/actions";
import { ActionForm, Submit } from "@/components/app/ActionForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { daysBetween, formatDateTimeJst, formatJpDate } from "@/lib/cash/dates";
import { yen } from "@/lib/cash/money";
import { ROLE_LABEL, type Role } from "@/lib/cash/types";
import { requireOrg } from "@/lib/data";
import { canWrite } from "@/lib/data/repo";

export const metadata = { title: "店舗・口座・ユーザー設定" };

const ACTION_LABEL: Record<string, string> = { insert: "追加", update: "変更", delete: "削除" };
const TABLE_LABEL: Record<string, string> = {
  organizations: "企業",
  organization_members: "メンバー",
  branches: "店舗",
  bank_accounts: "口座",
  balance_snapshots: "基準残高",
  cash_transactions: "取引",
  recurring_rules: "繰返し設定",
  import_jobs: "CSV取込",
  forecast_scenarios: "シナリオ",
  alert_rules: "アラート設定",
};
const KIND_LABEL = { bank: "銀行口座", cash: "現金", other: "その他" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { repo, user, data, today } = await requireOrg();
  const sp = await searchParams;
  const owner = data.role === "owner";
  const writable = canWrite(data.role);
  const org = data.organization;
  const audit = writable ? await repo.auditLog(org.id, 50) : [];
  const latest = (accountId: string) => data.snapshots.filter((s) => s.bank_account_id === accountId).sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">店舗・口座・ユーザー設定</h1>
        <p className="text-muted-foreground text-sm">あなたの権限：{ROLE_LABEL[data.role]}（{user.email}）</p>
      </div>
      {sp.created && (
        <p role="status" className="border-good/50 bg-good/10 rounded-lg border px-3 py-2 text-sm">
          企業を作成しました。次に、店舗（あれば）と口座を登録し、口座ごとの基準残高（ある日の確定残高）を入れてください。
        </p>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>企業</CardTitle>
            <CardDescription>最低必要残高を下回る予測になると、ダッシュボードで警告します。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateOrgAction} className="grid gap-3 sm:grid-cols-3">
            <Field label="企業名">
              <Input name="name" defaultValue={org.name} required maxLength={100} disabled={!owner} />
            </Field>
            <Field label="最低必要残高（円）" hint="企業全体で最低限残しておきたい現預金">
              <Input name="min_balance_jpy" inputMode="numeric" defaultValue={org.min_balance_jpy} disabled={!owner} />
            </Field>
            <Field label="未更新の警告（日）" hint="基準残高がこの日数より古い口座を警告">
              <Input name="stale_after_days" inputMode="numeric" defaultValue={org.stale_after_days} disabled={!owner} />
            </Field>
            {owner && (
              <div className="sm:col-span-3">
                <Submit>保存</Submit>
              </div>
            )}
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>店舗</CardTitle>
            <CardDescription>店舗ごとに口座を持つ場合に登録します。本部の口座は店舗なしで登録します。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.branches.length === 0 && <p className="text-muted-foreground text-sm">店舗はまだありません（1店舗だけなら登録しなくても使えます）。</p>}
          <ul className="divide-y">
            {data.branches.map((b) => (
              <li key={b.id} className="py-2">
                {writable ? (
                  <ActionForm action={saveBranchAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={b.id} />
                    <Field label="店舗名" className="min-w-40 flex-1">
                      <Input name="name" defaultValue={b.name} required maxLength={60} />
                    </Field>
                    <Field label="状態" className="w-32">
                      <Select name="is_active" defaultValue={String(b.is_active)}>
                        <option value="true">営業中</option>
                        <option value="false">休止・閉店</option>
                      </Select>
                    </Field>
                    <Submit size="sm" variant="outline">
                      更新
                    </Submit>
                  </ActionForm>
                ) : (
                  <p className="text-sm">
                    {b.name}
                    {!b.is_active && "（休止）"}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {writable && (
            <ActionForm action={saveBranchAction} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t pt-3">
              <Field label="新しい店舗" className="min-w-40 flex-1">
                <Input name="name" required maxLength={60} placeholder="例 渋谷店" />
              </Field>
              <Submit size="sm">店舗を追加</Submit>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      <Card id="accounts">
        <CardHeader>
          <div>
            <CardTitle>口座と基準残高</CardTitle>
            <CardDescription>
              基準残高＝ある日の終わり時点の確定残高（通帳・ネットバンキングの残高）。この日より後の確定取引を足して現在残高を出します。口座番号は保存せず、識別用に下4桁だけ登録できます。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.accounts.map((a) => {
            const s = latest(a.id);
            return (
              <div key={a.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {a.name}
                      {!a.is_active && <Badge variant="outline" className="ml-2">使用停止</Badge>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {KIND_LABEL[a.kind]}
                      {a.bank_name && `・${a.bank_name}`}
                      {a.number_last4 && `・下4桁 ${a.number_last4}`}・{data.branches.find((b) => b.id === a.branch_id)?.name ?? "本部"}
                      {a.min_balance_jpy > 0 && `・最低残高 ${yen(a.min_balance_jpy)}`}
                    </p>
                  </div>
                  <p className="text-right text-sm">
                    {s ? (
                      <>
                        <span className="font-semibold tabular-nums">{yen(s.balance_jpy)}</span>
                        <span className={`block text-xs ${daysBetween(s.as_of_date, today) > org.stale_after_days ? "text-warn" : "text-muted-foreground"}`}>
                          {formatJpDate(s.as_of_date, false)}時点（{daysBetween(s.as_of_date, today)}日前）
                        </span>
                      </>
                    ) : (
                      <span className="text-warn text-xs">基準残高 未登録</span>
                    )}
                  </p>
                </div>
                {writable && (
                  <>
                    <ActionForm action={saveSnapshotAction} resetOnSuccess className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="bank_account_id" value={a.id} />
                      <Field label="日付（この日の終わり時点）" className="w-44">
                        <Input type="date" name="as_of_date" defaultValue={today} required />
                      </Field>
                      <Field label="確定残高（円）" className="w-40">
                        <Input name="balance_jpy" inputMode="numeric" required />
                      </Field>
                      <Submit size="sm">残高を登録</Submit>
                    </ActionForm>
                    <details>
                      <summary className="text-muted-foreground cursor-pointer text-xs">口座の情報を変更</summary>
                      <AccountForm account={a} branches={data.branches} />
                    </details>
                  </>
                )}
              </div>
            );
          })}
          {writable && (
            <div className="rounded-lg border border-dashed p-3">
              <p className="mb-2 text-sm font-medium">口座を追加</p>
              <AccountForm branches={data.branches} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>メンバーと権限</CardTitle>
            <CardDescription>オーナー：すべて／経理担当：取引・口座の登録と変更／閲覧専用：見るだけ。追加できるのは、すでにサインアップ済みのユーザーです。</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="divide-y">
            {data.members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-end justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 break-all">
                  {m.email ?? "（メール不明）"}
                  {m.user_id === user.id && <Badge variant="outline" className="ml-2">あなた</Badge>}
                </span>
                {owner ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <ActionForm action={setMemberRoleAction} className="flex items-end gap-2">
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Select name="role" defaultValue={m.role} aria-label={`${m.email}の権限`} className="w-32">
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      <Submit size="sm" variant="outline">
                        変更
                      </Submit>
                    </ActionForm>
                    <ActionForm action={removeMemberAction} confirmText={`${m.email} をこの企業から外しますか？`}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <Submit size="sm" variant="ghost">
                        外す
                      </Submit>
                    </ActionForm>
                  </div>
                ) : (
                  <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                )}
              </li>
            ))}
          </ul>
          {owner && (
            <ActionForm action={addMemberAction} resetOnSuccess className="flex flex-wrap items-end gap-2 border-t pt-3">
              <Field label="メールアドレス" className="min-w-52 flex-1">
                <Input type="email" name="email" required maxLength={254} />
              </Field>
              <Field label="権限" className="w-32">
                <Select name="role" defaultValue="viewer">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Submit size="sm">追加</Submit>
            </ActionForm>
          )}
        </CardContent>
      </Card>

      {writable && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>監査ログ（直近50件）</CardTitle>
              <CardDescription>すべての追加・変更・削除を、誰がいつ行ったか記録しています（変更前後の内容はデータベースに保存）。</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-muted-foreground text-sm">記録はまだありません。</p>
            ) : (
              <ul className="divide-y text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      {TABLE_LABEL[a.table] ?? a.table}を{ACTION_LABEL[a.action] ?? a.action}
                      <span className="text-muted-foreground ml-2 text-xs">{a.summary}</span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTimeJst(a.at)}・{a.actor}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccountForm({
  account,
  branches,
}: {
  account?: { id: string; name: string; bank_name: string | null; kind: string; branch_id: string | null; number_last4: string | null; min_balance_jpy: number; is_active: boolean };
  branches: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={saveAccountAction} resetOnSuccess={!account} className="mt-2 grid gap-3 sm:grid-cols-3">
      {account && <input type="hidden" name="id" value={account.id} />}
      <Field label="口座名">
        <Input name="name" defaultValue={account?.name} required maxLength={60} placeholder="例 本部 普通預金" />
      </Field>
      <Field label="種類">
        <Select name="kind" defaultValue={account?.kind ?? "bank"}>
          <option value="bank">銀行口座</option>
          <option value="cash">現金（レジ・金庫）</option>
          <option value="other">その他</option>
        </Select>
      </Field>
      <Field label="金融機関名（任意）">
        <Input name="bank_name" defaultValue={account?.bank_name ?? ""} maxLength={60} />
      </Field>
      <Field label="店舗">
        <Select name="branch_id" defaultValue={account?.branch_id ?? ""}>
          <option value="">本部（店舗なし）</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="口座番号の下4桁（任意）" hint="全桁は入力しないでください">
        <Input name="number_last4" defaultValue={account?.number_last4 ?? ""} inputMode="numeric" maxLength={4} pattern="[0-9]{4}" />
      </Field>
      <Field label="この口座の最低残高（円・任意）">
        <Input name="min_balance_jpy" inputMode="numeric" defaultValue={account?.min_balance_jpy ?? 0} />
      </Field>
      {account && (
        <Field label="状態">
          <Select name="is_active" defaultValue={String(account.is_active)}>
            <option value="true">使用中</option>
            <option value="false">使用停止（合計に含めない）</option>
          </Select>
        </Field>
      )}
      <div className="sm:col-span-3">
        <Submit size="sm">{account ? "口座を更新" : "口座を追加"}</Submit>
      </div>
    </ActionForm>
  );
}
