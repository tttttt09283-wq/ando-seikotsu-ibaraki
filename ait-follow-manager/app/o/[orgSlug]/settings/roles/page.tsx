import { Check, Minus, Store } from "lucide-react";
import { PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/context";
import { PERMISSION_LABELS, PERMISSIONS, ROLE_LABELS, type Permission, type Role } from "@/lib/auth/permissions";

export const metadata = { title: "権限設定" };

const ROLES: Role[] = ["org_admin", "store_manager", "staff"];

export default async function RolesPage({ params }: PageProps<"/o/[orgSlug]/settings/roles">) {
  const { orgSlug } = await params;
  await getOrgContext(orgSlug);
  return (
    <>
      <PageHeader
        title="権限設定"
        back={`/o/${orgSlug}/more`}
        description="Phase 1 ではロールごとの権限は固定です。スタッフのロールは「スタッフ管理」で変更できます。"
      />
      <Card>
        <CardContent className="overflow-x-auto pt-4">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2">操作</th>
                {ROLES.map((r) => (
                  <th key={r} className="py-2 text-center">
                    {ROLE_LABELS[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                <tr key={p} className="border-t">
                  <td className="py-2">{PERMISSION_LABELS[p]}</td>
                  {ROLES.map((r) => {
                    const scope = PERMISSIONS[p][r];
                    return (
                      <td key={r} className="py-2 text-center">
                        {scope === "org" ? (
                          <Check className="mx-auto size-4 text-success" aria-label="可" />
                        ) : scope === "store" ? (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Store className="size-4" aria-hidden />
                            自店舗
                          </span>
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground" aria-label="不可" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        A.I.T company の運営管理者（Platform Admin）は、組織の作成・停止と件数の確認のみ可能で、顧客情報は閲覧できません。
      </p>
    </>
  );
}
