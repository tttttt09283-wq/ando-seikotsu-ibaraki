import { describe, expect, it } from "vitest";
import {
  clinicCreateSchema,
  contractSchema,
  parseForm,
  roleGrantSchema,
  staffCreateSchema,
  supportAssignmentSchema,
} from "@/lib/validation/schemas";
import { toUserMessage } from "@/lib/errors";

const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("入力検証", () => {
  it("院コードは大文字に正規化し、不正な文字を拒否する", () => {
    const ok = parseForm(clinicCreateSchema, form({ clinic_code: "neyagawa", name: "寝屋川院" }));
    expect(ok.ok && ok.data.clinic_code).toBe("NEYAGAWA");
    const ng = parseForm(clinicCreateSchema, form({ clinic_code: "寝屋川", name: "寝屋川院" }));
    expect(ng.ok).toBe(false);
  });

  it("スタッフIDは4〜8桁の数字のみ", () => {
    const base = { family_name: "安藤", given_name: "太郎", hire_date: "2026-10-01", primary_clinic_id: UUID };
    expect(parseForm(staffCreateSchema, form({ ...base, staff_code: "0123" })).ok).toBe(true);
    const ng = parseForm(staffCreateSchema, form({ ...base, staff_code: "12a4" }));
    expect(ng).toEqual({ ok: false, message: "スタッフIDは4〜8桁の数字で入力してください" });
  });

  it("空欄の任意項目は null になる", () => {
    const r = parseForm(
      staffCreateSchema,
      form({ staff_code: "1234", family_name: "安藤", given_name: "花子", hire_date: "2026-10-01", primary_clinic_id: UUID, phone: "" }),
    );
    expect(r.ok && r.data.phone).toBeNull();
  });

  it("院長ロールには担当院が必須、他のロールには院を指定できない", () => {
    const base = { user_id: UUID, valid_from: "2026-10-18" };
    expect(parseForm(roleGrantSchema, form({ ...base, role: "clinic_manager" })).ok).toBe(false);
    expect(parseForm(roleGrantSchema, form({ ...base, role: "clinic_manager", clinic_id: UUID })).ok).toBe(true);
    expect(parseForm(roleGrantSchema, form({ ...base, role: "hq_admin", clinic_id: UUID })).ok).toBe(false);
    expect(parseForm(roleGrantSchema, form({ ...base, role: "hq_admin" })).ok).toBe(true);
  });

  it("応援期間の終了日は開始日以降", () => {
    const r = parseForm(
      supportAssignmentSchema,
      form({ staff_id: UUID, clinic_id: UUID, valid_from: "2026-10-18", valid_to: "2026-10-01" }),
    );
    expect(r).toEqual({ ok: false, message: "終了日は開始日以降にしてください" });
  });
});

describe("DBエラーの日本語化", () => {
  it("制約名から利用者向けメッセージを返す", () => {
    expect(toUserMessage({ code: "23P01", message: 'conflicting key value violates exclusion constraint "assignment_primary_no_overlap"' })).toContain(
      "主所属が重複",
    );
    expect(toUserMessage({ code: "23505", message: 'duplicate key value violates unique constraint "staff_profiles_staff_code_key"' })).toBe(
      "そのスタッフIDは既に使われています",
    );
  });

  it("RPC の日本語メッセージはそのまま、英語の権限エラーは汎用文言にする", () => {
    expect(toUserMessage({ code: "42501", message: "スタッフ登録は本部のみ可能です" })).toBe("スタッフ登録は本部のみ可能です");
    expect(toUserMessage({ code: "42501", message: "permission denied for table clinics" })).toBe("この操作を行う権限がありません");
  });

  it("想定外のエラーでは内部情報を出さない", () => {
    expect(toUserMessage({ code: "XX000", message: "internal: relation secret" })).not.toContain("secret");
  });
});

describe("勤務条件の入力", () => {
  const base = {
    staff_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    valid_from: "2026-10-01",
    employment_type: "full_time",
    weekly_scheduled_days: "5",
    daily_scheduled_minutes: "8",
    weekly_scheduled_minutes: "40",
    legal_weekly_limit_minutes: "2400",
    reason: "入社時の契約",
  };

  it("時間入力を分に変換し、みなし残業の空欄は標準値（DB側）に任せる", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ ...base, fixed_overtime_minutes: "" })) fd.set(k, v);
    const r = parseForm(contractSchema, fd);
    expect(r.ok && r.data).toMatchObject({
      daily_scheduled_minutes: 480,
      weekly_scheduled_minutes: 2400,
      fixed_overtime_minutes: null,
      legal_weekly_limit_minutes: 2400,
    });
  });

  it("みなし残業を個別に指定でき、15分単位以外は拒否する", () => {
    const ok = new FormData();
    for (const [k, v] of Object.entries({ ...base, fixed_overtime_minutes: "30" })) ok.set(k, v);
    const r = parseForm(contractSchema, ok);
    expect(r.ok && r.data.fixed_overtime_minutes).toBe(1800);

    const ng = new FormData();
    for (const [k, v] of Object.entries({ ...base, fixed_overtime_minutes: "24.1" })) ng.set(k, v);
    expect(parseForm(contractSchema, ng)).toEqual({ ok: false, message: "みなし残業時間は15分（0.25時間）単位で入力してください" });
  });
});
