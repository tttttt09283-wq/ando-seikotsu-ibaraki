import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx } from "./helpers";

afterAll(closePool);

describe("使い始めセット", () => {
  it("登録コードの有効期限を最長7日まで指定でき、範囲外は拒否する", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      await tx.as(hq).sql("select public.issue_kiosk_registration($1, 'tab', null, 168)", [ibaraki]);
      const [{ hours }] = await tx.sql<{ hours: number }>(
        "select round(extract(epoch from registration_expires_at - now()) / 3600)::int as hours from public.kiosk_devices",
      );
      expect(hours).toBe(168);
      await expect(tx.as(hq).sql("select public.issue_kiosk_registration($1, 'tab', null, 169)", [ibaraki])).rejects.toThrow(/7日/);
      // 期限を指定しない呼び出しは従来どおり24時間
      const [{ r }] = await tx.as(hq).sql<{ r: { expires_at: string } }>("select public.issue_kiosk_registration($1, 'tab2') as r", [ibaraki]);
      expect(Math.round((new Date(r.expires_at).getTime() - Date.now()) / 3_600_000)).toBe(24);
    });
  });

  it("別の院の端末を指定して登録コードを出し直すことはできない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const korien = await tx.clinicId("KORIEN");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const [{ r }] = await tx.as(hq).sql<{ r: { device_id: string } }>("select public.issue_kiosk_registration($1, 'tab') as r", [ibaraki]);
      await expect(tx.as(hq).sql("select public.issue_kiosk_registration($1, 'tab', $2)", [korien, r.device_id])).rejects.toThrow(/見つかりません/);
    });
  });

  it("院のスタッフとPINの発行状況は本部だけが見られ、PINそのものは返さない", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const korien = await tx.clinicId("KORIEN");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
      const a = await tx.createStaff("1001", ibaraki);
      await tx.createStaff("1002", ibaraki);
      await tx.createStaff("2001", korien);
      await tx.as(hq).sql("select public.set_kiosk_pin($1, '482916')", [a]);

      const rows = await tx.as(hq).sql<Record<string, unknown>>("select * from public.clinic_pin_overview($1)", [ibaraki]);
      expect(rows.map((r) => [r.staff_code, r.has_pin, r.must_change])).toEqual([
        ["1001", true, true],
        ["1002", false, false],
      ]);
      expect(Object.keys(rows[0])).not.toContain("pin_hash");
      await expect(tx.as(manager).sql("select * from public.clinic_pin_overview($1)", [ibaraki])).rejects.toThrow(/本部のみ/);
    });
  });
});
