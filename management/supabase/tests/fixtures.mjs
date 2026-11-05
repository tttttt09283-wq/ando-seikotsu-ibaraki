// テスト用のダミー組織（実在の人は使わない）
// エリア：北（枚方本院・田口山分院・津田院・交野院）／南（茨木院・大和田院・香里園院）
import { randomUUID } from "node:crypto";

export async function buildOrg(q) {
  const store = Object.fromEntries((await q("select code, id from mgmt.stores")).rows.map((r) => [r.code, r.id]));
  const role = Object.fromEntries((await q("select code, id from mgmt.roles")).rows.map((r) => [r.code, r.id]));
  const north = (await q("insert into mgmt.areas (name) values ('北エリア') returning id")).rows[0].id;
  const south = (await q("insert into mgmt.areas (name) values ('南エリア') returning id")).rows[0].id;
  await q("update mgmt.stores set area_id = $1 where code in ('HIRAKATA','TAGUCHIYAMA','TSUDA','KATANO')", [north]);
  await q("update mgmt.stores set area_id = $1 where code in ('IBARAKI','OWADA','KORIEN')", [south]);
  const u = {};
  let n = 0;
  const user = async (key, extra = {}) => {
    const id = randomUUID();
    n++;
    await q("insert into auth.users (id, email) values ($1, $2)", [id, `test${n}@ando.jp`]);
    await q("insert into mgmt.users (id, staff_code, login_id, name, status, retired_at) values ($1,$2,$3,$4,$5,$6)",
      [id, `T${String(n).padStart(3, "0")}`, `test${n}`, `テスト${key}`, extra.status || "active", extra.status === "retired" ? "2026-10-31" : null]);
    u[key] = id;
    return id;
  };
  const assign = (userKey, storeCode, roleCode, extra = {}) =>
    q("insert into mgmt.user_store_assignments (user_id, store_id, role_id, is_primary, starts_on, ends_on) values ($1,$2,$3,$4,$5,$6)",
      [u[userKey], store[storeCode], role[roleCode], extra.primary ?? true, extra.starts ?? "2026-01-01", extra.ends ?? null]);
  const grant = (userKey, roleCode, areaId = null) =>
    q("insert into mgmt.user_roles (user_id, role_id, area_id, starts_on) values ($1,$2,$3,'2026-01-01')", [u[userKey], role[roleCode], areaId]);

  await user("president"); await grant("president", "PRESIDENT");
  await user("gm"); await grant("gm", "GM");
  await user("bmSouth"); await grant("bmSouth", "BM", south);
  // 7院それぞれに院長1名・スタッフ1名
  for (const code of Object.keys(store)) {
    await user(`mgr_${code}`); await assign(`mgr_${code}`, code, "MANAGER");
    await user(`staff_${code}`); await assign(`staff_${code}`, code, "STAFF");
  }
  // 複数店舗所属：交野院の院長 ＋ 茨木院の一般スタッフ
  await user("dual"); await assign("dual", "KATANO", "MANAGER", { primary: true }); await assign("dual", "IBARAKI", "STAFF", { primary: false });
  await user("parttimer"); await assign("parttimer", "KORIEN", "PART_TIMER");
  await user("retired", { status: "retired" }); await assign("retired", "TSUDA", "STAFF");
  // 異動済み：以前は枚方本院（終了）、今は津田院
  await user("moved"); await assign("moved", "HIRAKATA", "STAFF", { primary: false, starts: "2026-01-01", ends: "2026-03-31" }); await assign("moved", "TSUDA", "STAFF", { starts: "2026-04-01" });
  return { u, store, role, area: { north, south } };
}
