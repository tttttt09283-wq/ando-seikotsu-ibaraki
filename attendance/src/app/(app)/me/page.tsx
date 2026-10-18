import { requireActor } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Card, PageHeader } from "@/components/ui";
import { staffName, type StaffRow } from "@/lib/data/types";

/** マイページ。フェーズ4以降で自分のシフト・勤怠・休暇残数を表示する */
export default async function MyPage() {
  const actor = await requireActor();
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("staff_profiles")
    .select("staff_code, family_name, given_name")
    .eq("auth_user_id", actor.userId)
    .maybeSingle();
  const staff = data as Pick<StaffRow, "staff_code" | "family_name" | "given_name"> | null;

  return (
    <>
      <PageHeader title="マイページ" />
      <Card>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">表示名</dt>
          <dd>{actor.displayName}</dd>
          <dt className="text-slate-500">ログインID</dt>
          <dd>{actor.email}</dd>
          <dt className="text-slate-500">ロール</dt>
          <dd>{[...new Set(actor.roles.map((r) => ROLE_LABELS[r.role]))].join("・") || "なし"}</dd>
          <dt className="text-slate-500">スタッフ</dt>
          <dd>{staff ? `${staffName(staff)}（${staff.staff_code}）` : "紐付けなし"}</dd>
        </dl>
      </Card>
    </>
  );
}
