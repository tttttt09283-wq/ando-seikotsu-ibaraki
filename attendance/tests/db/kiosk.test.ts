import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTx, type TestTx } from "./helpers";

afterAll(closePool);

type Json = Record<string, unknown>;

async function setup(tx: TestTx) {
  const ibaraki = await tx.clinicId("IBARAKI");
  const korien = await tx.clinicId("KORIEN");
  const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
  const manager = await tx.createUser("mgr@example.com", [{ role: "clinic_manager", clinicId: ibaraki }]);
  const staff = await tx.createStaff("1001", ibaraki);
  const ibarakiSecret = await registerDevice(tx, hq, ibaraki, "茨木 受付タブレット");
  const korienSecret = await registerDevice(tx, hq, korien, "香里園 受付タブレット");
  await tx.as(hq).sql("select public.set_kiosk_pin($1, '482916')", [staff]);
  return { ibaraki, korien, hq, manager, staff, ibarakiSecret, korienSecret };
}

async function registerDevice(tx: TestTx, hq: string, clinicId: string, name: string) {
  const [{ r }] = await tx.as(hq).sql<{ r: { code: string } }>("select public.issue_kiosk_registration($1, $2) as r", [clinicId, name]);
  const [{ d }] = await tx.as(null).sql<{ d: { ok: boolean; secret: string } }>("select public.kiosk_register_device($1) as d", [r.code]);
  expect(d.ok).toBe(true);
  return d.secret;
}

const kiosk = (tx: TestTx) => ({
  auth: async (secret: string, code: string, pin: string) =>
    (await tx.as(null).sql<{ r: Json }>("select public.kiosk_authenticate($1, $2, $3) as r", [secret, code, pin]))[0].r,
  punch: async (secret: string, token: unknown, type: string, clientEventId = randomUUID()) =>
    (await tx.as(null).sql<{ r: Json }>("select public.kiosk_punch($1, $2, $3, $4, now()) as r", [secret, token, type, clientEventId]))[0].r,
});

describe("端末登録", () => {
  it("登録コードは1回しか使えず、端末シークレットはハッシュのみ保存される", async () => {
    await withTx(async (tx) => {
      const ibaraki = await tx.clinicId("IBARAKI");
      const hq = await tx.createUser("hq@example.com", [{ role: "hq_admin" }]);
      const [{ r }] = await tx.as(hq).sql<{ r: { code: string } }>("select public.issue_kiosk_registration($1, 'tab') as r", [ibaraki]);
      const first = (await tx.as(null).sql<{ d: Json }>("select public.kiosk_register_device($1) as d", [r.code]))[0].d;
      const second = (await tx.as(null).sql<{ d: Json }>("select public.kiosk_register_device($1) as d", [r.code]))[0].d;
      expect(first.ok).toBe(true);
      expect(second).toEqual({ ok: false, error: "invalid_code" });
      const [device] = await tx.sql<{ secret_hash: string }>("select secret_hash from public.kiosk_devices");
      expect(device.secret_hash).not.toBe(first.secret);
      expect(device.secret_hash).toHaveLength(64);
    });
  });

  it("院長は端末を登録できず、停止された端末では打刻できない", async () => {
    await withTx(async (tx) => {
      const { ibaraki, manager, hq, staff, ibarakiSecret } = await setup(tx);
      await expect(tx.as(manager).sql("select public.issue_kiosk_registration($1, 'x')", [ibaraki])).rejects.toThrow(/本部のみ/);
      const [{ device_id }] = await tx.sql<{ device_id: string }>("select device_id from public.kiosk_devices where clinic_id = $1", [ibaraki]);
      await tx.as(hq).sql("select public.disable_kiosk_device($1)", [device_id]);
      expect(await kiosk(tx).auth(ibarakiSecret, "1001", "482916")).toEqual({ ok: false, error: "device_invalid" });
      expect(staff).toBeTruthy();
    });
  });
});

describe("本人認証（スタッフID＋PIN）", () => {
  it("PINは平文で保存されず、スタッフIDだけでは打刻できない", async () => {
    await withTx(async (tx) => {
      const { staff, ibarakiSecret } = await setup(tx);
      const [cred] = await tx.sql<{ pin_hash: string }>("select pin_hash from public.kiosk_credentials where staff_id = $1", [staff]);
      expect(cred.pin_hash).not.toContain("482916");
      expect(cred.pin_hash.startsWith("$2")).toBe(true); // bcrypt
      expect(await kiosk(tx).auth(ibarakiSecret, "1001", "")).toMatchObject({ ok: false, error: "invalid" });
      expect(await kiosk(tx).punch(ibarakiSecret, null, "clock_in")).toEqual({ ok: false, error: "session_invalid" });
    });
  });

  it("5回連続で失敗するとロックされ、正しいPINでも15分間は認証できない。院長が解除できる", async () => {
    await withTx(async (tx) => {
      const { staff, manager, ibarakiSecret } = await setup(tx);
      const k = kiosk(tx);
      for (let i = 1; i <= 4; i++) expect(await k.auth(ibarakiSecret, "1001", "000001")).toMatchObject({ error: "invalid", remaining: 5 - i });
      expect(await k.auth(ibarakiSecret, "1001", "000001")).toMatchObject({ error: "locked" });
      expect(await k.auth(ibarakiSecret, "1001", "482916")).toMatchObject({ ok: false, error: "locked" });
      await tx.as(manager).sql("select public.unlock_kiosk_pin($1)", [staff]);
      expect(await k.auth(ibarakiSecret, "1001", "482916")).toMatchObject({ ok: true });
      const results = await tx.sql<{ result: string }>("select result from public.kiosk_auth_attempts order by id");
      expect(results.map((r) => r.result)).toEqual(["bad_pin", "bad_pin", "bad_pin", "bad_pin", "bad_pin", "locked", "success"]);
    });
  });

  it("推測しやすいPINは設定できない", async () => {
    await withTx(async (tx) => {
      const { hq, staff } = await setup(tx);
      for (const pin of ["1234", "111111", "987654", "12a456"]) {
        await expect(tx.as(hq).sql("select public.set_kiosk_pin($1, $2)", [staff, pin])).rejects.toThrow(/PIN/);
      }
    });
  });

  it("初回PINは端末で本人が変更する", async () => {
    await withTx(async (tx) => {
      const { ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      expect(auth.must_change_pin).toBe(true);
      const [{ r }] = await tx.as(null).sql<{ r: Json }>("select public.kiosk_change_pin($1, $2, '739205') as r", [ibarakiSecret, auth.session_token]);
      expect(r.ok).toBe(true);
      expect(await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in")).toEqual({ ok: false, error: "session_invalid" });
      expect(await kiosk(tx).punch(ibarakiSecret, r.session_token, "clock_in")).toMatchObject({ ok: true });
      expect(await kiosk(tx).auth(ibarakiSecret, "1001", "739205")).toMatchObject({ ok: true, must_change_pin: false });
    });
  });
});

describe("必須テスト5：別人の認証情報が残らない", () => {
  it("認証セッションは打刻1回で失効し、次の人が同じトークンで打刻できない", async () => {
    await withTx(async (tx) => {
      const { ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      expect(await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in")).toMatchObject({ ok: true, punch_type: "clock_in" });
      expect(await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_out")).toEqual({ ok: false, error: "session_invalid" });
    });
  });

  it("他の端末のセッションは使えない", async () => {
    await withTx(async (tx) => {
      const { ibarakiSecret, korienSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      expect(await kiosk(tx).punch(korienSecret, auth.session_token, "clock_in")).toEqual({ ok: false, error: "session_invalid" });
    });
  });
});

describe("必須テスト6：二重打刻の防止", () => {
  it("同じ打刻の再送（同じ client_event_id）は1件だけ記録される", async () => {
    await withTx(async (tx) => {
      const { staff, ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      const eventId = randomUUID();
      const first = await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in", eventId);
      const resend = await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in", eventId);
      expect(first).toMatchObject({ ok: true, duplicate: false });
      expect(resend).toMatchObject({ ok: true, duplicate: true, punched_at: first.punched_at });
      const [{ n }] = await tx.sql<{ n: number }>("select count(*)::int as n from public.raw_punch_events where staff_id = $1", [staff]);
      expect(n).toBe(1);
    });
  });

  it("出勤中の再出勤・休憩中の退勤など順序の誤りは拒否され、直後の二度押しは記録済み扱いになる", async () => {
    await withTx(async (tx) => {
      const { staff, ibarakiSecret } = await setup(tx);
      const k = kiosk(tx);
      const punch = async (type: string) => k.punch(ibarakiSecret, (await k.auth(ibarakiSecret, "1001", "482916")).session_token, type);
      expect(await punch("clock_in")).toMatchObject({ ok: true });
      expect(await punch("clock_in")).toMatchObject({ ok: true, duplicate: true }); // 二度押し
      expect(await punch("break_start")).toMatchObject({ ok: true });
      expect(await punch("clock_out")).toMatchObject({ ok: false, error: "invalid_transition", state: "on_break" });
      expect(await punch("break_end")).toMatchObject({ ok: true });
      expect(await punch("clock_out")).toMatchObject({ ok: true });
      const types = await tx.sql<{ punch_type: string }>("select punch_type::text from public.raw_punch_events where staff_id = $1 order by punched_at, created_at", [staff]);
      expect(types.map((t) => t.punch_type)).toEqual(["clock_in", "break_start", "break_end", "clock_out"]);
    });
  });

  it("打刻時刻はサーバーで確定し、端末時刻は参考値として保存される", async () => {
    await withTx(async (tx) => {
      const { ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      await tx
        .as(null)
        .sql("select public.kiosk_punch($1, $2, 'clock_in', $3, '2020-01-01T00:00:00Z')", [ibarakiSecret, auth.session_token, randomUUID()]);
      const [row] = await tx.sql<{ server_ok: boolean; device: string }>(
        "select abs(extract(epoch from punched_at - now())) < 5 as server_ok, device_reported_at::text as device from public.raw_punch_events",
      );
      expect(row.server_ok).toBe(true);
      expect(row.device).toContain("2020-01-01");
    });
  });

  it("認証から時間が経って届いた打刻は遅延送信として記録され、勤怠の異常になる", async () => {
    await withTx(async (tx) => {
      const { staff, ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      await tx.sql("update public.kiosk_sessions set created_at = now() - interval '30 minutes'");
      expect(await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in")).toMatchObject({ ok: true, delayed: true });
      const [att] = await tx.sql<{ anomalies: string[] }>("select anomalies from public.attendance_daily where staff_id = $1", [staff]);
      expect(att.anomalies).toContain("delayed_submission");
    });
  });
});

describe("必須テスト7：応援勤務は実勤務院に記録される", () => {
  it("所属院と異なる院の端末で打刻すると、打刻院と主所属院が別々に記録される", async () => {
    await withTx(async (tx) => {
      const { ibaraki, korien, staff, korienSecret } = await setup(tx);
      await tx.addSupport(staff, korien);
      const auth = await kiosk(tx).auth(korienSecret, "1001", "482916");
      await kiosk(tx).punch(korienSecret, auth.session_token, "clock_in");
      const [ev] = await tx.sql<{ clinic_id: string; home_clinic_id: string }>("select clinic_id, home_clinic_id from public.raw_punch_events where staff_id = $1", [staff]);
      expect(ev).toEqual({ clinic_id: korien, home_clinic_id: ibaraki });
      const [att] = await tx.sql<{ clinic_ids: string[]; home_clinic_id: string; anomalies: string[] }>(
        "select clinic_ids, home_clinic_id, anomalies from public.attendance_daily where staff_id = $1",
        [staff],
      );
      expect(att).toMatchObject({ clinic_ids: [korien], home_clinic_id: ibaraki });
      expect(att.anomalies).not.toContain("unassigned_clinic");
    });
  });

  it("応援登録のない院で打刻しても記録は残り、所属外の打刻として異常になる", async () => {
    await withTx(async (tx) => {
      const { staff, korienSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(korienSecret, "1001", "482916");
      expect(await kiosk(tx).punch(korienSecret, auth.session_token, "clock_in")).toMatchObject({ ok: true });
      const [att] = await tx.sql<{ anomalies: string[] }>("select anomalies from public.attendance_daily where staff_id = $1", [staff]);
      expect(att.anomalies).toContain("unassigned_clinic");
    });
  });
});

describe("打刻原本の保護と参照権限", () => {
  it("打刻原本は誰も変更・削除できない", async () => {
    await withTx(async (tx) => {
      const { hq, ibarakiSecret } = await setup(tx);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in");
      await expect(tx.sql("update public.raw_punch_events set punched_at = now() - interval '1 hour'")).rejects.toThrow(/追記専用/);
      await expect(tx.sql("delete from public.raw_punch_events")).rejects.toThrow(/追記専用/);
      await expect(tx.as(hq).sql("update public.raw_punch_events set punched_at = now()")).rejects.toThrow(/permission denied/);
    });
  });

  it("他院の院長は打刻・勤怠を参照できず、PIN情報は誰も直接読めない", async () => {
    await withTx(async (tx) => {
      const { korien, ibarakiSecret } = await setup(tx);
      const korienManager = await tx.createUser("mgr-korien@example.com", [{ role: "clinic_manager", clinicId: korien }]);
      const auth = await kiosk(tx).auth(ibarakiSecret, "1001", "482916");
      await kiosk(tx).punch(ibarakiSecret, auth.session_token, "clock_in");
      expect(await tx.as(korienManager).sql("select * from public.raw_punch_events")).toHaveLength(0);
      expect(await tx.as(korienManager).sql("select * from public.attendance_daily")).toHaveLength(0);
      await expect(tx.as(korienManager).sql("select * from public.kiosk_credentials")).rejects.toThrow(/permission denied/);
    });
  });
});
