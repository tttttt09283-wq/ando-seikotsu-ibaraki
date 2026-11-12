import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/repo/memory";
import { createReservation } from "./reservations";
import { addBlock, publishService, saveService, setBookingEnabled, setCompanyApproval, setOpeningReady, updateLocationTexts } from "./admin-settings";
import { csvCell, exportReservationsCsv } from "./export";
import { AuthorizationError } from "@/lib/auth/permissions";
import { NOW, DAY, OWNER, STAFF_PRIVATE_ONLY, homeService, input, openHome, openWorkplace } from "@/test/fixtures";

let repo: MemoryRepo;
beforeEach(() => {
  repo = new MemoryRepo();
});

describe("受付開始の手順（管理画面）", () => {
  it("自宅院：開業準備完了の記録 → 料金の公開承認 → 受付開始", async () => {
    await expect(setBookingEnabled(repo, OWNER, "home", true)).rejects.toThrow(/開業準備完了/);
    await expect(setOpeningReady(repo, OWNER, "home", true, "")).rejects.toThrow(/記録/);
    await setOpeningReady(repo, OWNER, "home", true, "開設届 提出済み 2026-12-01");
    await setBookingEnabled(repo, OWNER, "home", true);
    const svc = await homeService(repo);
    await publishService(repo, OWNER, svc.id, true, "");
    expect((await repo.getService(svc.id))!.is_published).toBe(true);
    const audit = await repo.listAudit({});
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["opening_ready_set", "booking_enabled", "service_published"]));
  });

  it("勤務先：会社承認の記録なしでは受付開始・料金公開ができない", async () => {
    await expect(setBookingEnabled(repo, OWNER, "ibaraki", true)).rejects.toThrow(/会社の正式承認/);
    await saveService(repo, OWNER, "ibaraki", null, { name: "鍼灸", description: "", duration_minutes: 60, price_tax_included: 6000, sort_order: 1 });
    const svc = (await repo.listServices("ibaraki"))[0];
    expect(svc.is_published).toBe(false);
    await expect(publishService(repo, OWNER, svc.id, true, "")).rejects.toThrow(/会社が承認した料金/);
    await setCompanyApproval(repo, OWNER, "ibaraki", true, "院長○○ 2026-11-20 書面承認", NOW);
    await setBookingEnabled(repo, OWNER, "ibaraki", true);
    await publishService(repo, OWNER, svc.id, true, "本部 2026-11-20 料金表承認");
    // 承認を取り消すと受付も止まる
    await setCompanyApproval(repo, OWNER, "ibaraki", false, "", NOW);
    expect((await repo.getLocation("ibaraki"))!.booking_enabled).toBe(false);
  });

  it("料金・時間を変更したら非公開に戻り、再承認が必要", async () => {
    await openHome(repo);
    const svc = await homeService(repo);
    await saveService(repo, OWNER, "home", svc.id, { name: svc.name, description: svc.description, duration_minutes: 60, price_tax_included: 11000, sort_order: 2 });
    const after = (await repo.getService(svc.id))!;
    expect(after.is_published).toBe(false);
    expect(after.price_status).toBe("proposed");
  });

  it("医療効果の保証表現はメニュー・案内文に登録できない", async () => {
    await expect(saveService(repo, OWNER, "home", null, { name: "根本改善", description: "必ず治ります", duration_minutes: 60, price_tax_included: 1000, sort_order: 1 })).rejects.toThrow(/保証/);
    await expect(updateLocationTexts(repo, OWNER, "home", { precautions: "1回で完治します" })).rejects.toThrow(/保証/);
  });

  it("スタッフは受付開始・承認・設定変更ができない", async () => {
    await expect(setOpeningReady(repo, STAFF_PRIVATE_ONLY, "home", true, "x")).rejects.toThrow(AuthorizationError);
    await expect(setCompanyApproval(repo, STAFF_PRIVATE_ONLY, "ibaraki", true, "xxxx", NOW)).rejects.toThrow(AuthorizationError);
    await expect(addBlock(repo, STAFF_PRIVATE_ONLY, { date: DAY, start_time: "10:00", end_time: "11:00" })).rejects.toThrow(AuthorizationError);
  });
});

describe("CSV 出力", () => {
  it("権限（export）がなければ出力できない", async () => {
    await expect(exportReservationsCsv(repo, STAFF_PRIVATE_ONLY, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).rejects.toThrow(AuthorizationError);
    await expect(exportReservationsCsv(repo, null, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).rejects.toThrow(AuthorizationError);
  });

  it("許可された管理主体の予約だけを出力し、監査ログに残す", async () => {
    await openHome(repo);
    const w = await openWorkplace(repo, "ibaraki");
    const svc = await homeService(repo);
    await createReservation(repo, input({ service_id: svc.id, name: "=HYPERLINK(\"x\")" }), { now: NOW });
    await createReservation(repo, input({ location_id: "ibaraki", service_id: w.id, date: "2026-11-17", name: "勤務先 太郎" }), { now: NOW });
    const privateExporter = { ...STAFF_PRIVATE_ONLY, can_export: true };
    const csv = await exportReservationsCsv(repo, privateExporter, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" });
    expect(csv.startsWith("﻿予約番号")).toBe(true);
    expect(csv).not.toContain("勤務先 太郎");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).not.toContain("肩こり"); // 相談内容は出力しない
    await expect(exportReservationsCsv(repo, privateExporter, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z", locationId: "ibaraki" })).rejects.toThrow(AuthorizationError);
    const all = await exportReservationsCsv(repo, OWNER, { from: "2026-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" });
    expect(all).toContain("勤務先 太郎");
    expect((await repo.listAudit({})).filter((a) => a.action === "csv_exported")).toHaveLength(2);
  });

  it("CSV セルのエスケープ", () => {
    expect(csvCell("+81")).toBe("'+81");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
  });
});
