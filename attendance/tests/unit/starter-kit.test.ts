import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { kitRequestSchema, pinStateOf, reusableDeviceId, staffToIssue } from "@/lib/kit/plan";
import { buildKitWorkbook, formatCode } from "@/lib/kit/workbook";

const rows = [
  { staff_id: "a", staff_code: "1001", family_name: "山田", given_name: "太郎", has_pin: true },
  { staff_id: "b", staff_code: "1002", family_name: "佐藤", given_name: "花子", has_pin: false },
];

describe("使い始めセット：発行対象", () => {
  it("未発行だけ／全員／発行しない", () => {
    expect(staffToIssue(rows, "missing").map((r) => r.staff_code)).toEqual(["1002"]);
    expect(staffToIssue(rows, "all")).toHaveLength(2);
    expect(staffToIssue(rows, "none")).toEqual([]);
    expect(pinStateOf(rows[0], false)).toBe("existing");
    expect(pinStateOf(rows[1], false)).toBe("none");
    expect(pinStateOf(rows[1], true)).toBe("issued");
  });

  it("同じ院・同じ名前の登録待ち端末だけを出し直しの対象にする", () => {
    const devices = [
      { device_id: "d1", clinic_id: "c1", name: "受付タブレット", status: "active" },
      { device_id: "d2", clinic_id: "c1", name: "受付タブレット", status: "pending" },
      { device_id: "d3", clinic_id: "c2", name: "受付タブレット", status: "pending" },
    ];
    expect(reusableDeviceId(devices, "c1", "受付タブレット")).toBe("d2");
    expect(reusableDeviceId(devices, "c1", "2台目")).toBeNull();
  });

  it("有効期限は1〜7日", () => {
    const base = { clinic_id: "3f1c2b8e-7d4a-4c1e-9b2a-5e6f7a8b9c0d", device_mode: "new", pin_mode: "missing" };
    expect(kitRequestSchema.safeParse({ ...base, valid_days: "7" }).success).toBe(true);
    expect(kitRequestSchema.safeParse({ ...base, valid_days: "8" }).success).toBe(false);
  });
});

describe("使い始めセット：Excel", () => {
  it("はじめに・PIN配布票・スタッフ一覧を作り、PINは今回発行した人だけ載せる", async () => {
    const buf = await buildKitWorkbook({
      clinicName: "茨木院",
      issuedAt: "2026/10/26 11:00",
      appUrl: "https://example.test/login",
      kioskUrl: "https://example.test/kiosk",
      registration: { deviceName: "受付タブレット", code: "ABCD2345", expiresAt: "2026/11/02 11:00", qrPng: await tinyPng() },
      managers: [{ name: "院長", email: "mgr@example.com" }],
      staff: [
        { code: "1001", name: "山田 太郎", pin: null, state: "existing" },
        { code: "1002", name: "佐藤 花子", pin: "582941", state: "issued" },
      ],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["はじめに", "PIN配布票", "スタッフ一覧"]);
    const text = (name: string) => {
      const out: string[] = [];
      wb.getWorksheet(name)!.eachRow((r) => r.eachCell((c) => out.push(String(c.value ?? ""))));
      return out.join("\n");
    };
    expect(text("はじめに")).toContain(formatCode("ABCD2345"));
    expect(text("はじめに")).toContain("mgr@example.com");
    expect(text("PIN配布票")).toContain("582941");
    expect(text("PIN配布票")).not.toContain("山田");
    expect(text("スタッフ一覧")).toContain("発行済み（今のPINのまま）");
    expect(wb.getWorksheet("はじめに")!.getImages()).toHaveLength(1);
  });
});

async function tinyPng() {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toBuffer("https://example.test/kiosk#code=ABCD2345");
}
