import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL, type Me } from "@/lib/roles";

export function RoleList({ me }: { me: Pick<Me, "global_roles" | "stores"> }) {
  if (!me.global_roles.length && !me.stores.length) return <p className="text-sm text-stone-500">役職・所属が設定されていません</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {me.global_roles.map((r) => <li key={`g-${r.role}-${r.area_id ?? ""}`}><Badge tone="brand">{ROLE_LABEL[r.role]}{r.area ? `（${r.area}）` : ""}</Badge></li>)}
      {me.stores.map((s) => <li key={`s-${s.store_id}`}><Badge tone={s.is_primary ? "brand" : "neutral"}>{s.store} {ROLE_LABEL[s.role]}{s.is_primary ? "（主所属）" : ""}</Badge></li>)}
    </ul>
  );
}
