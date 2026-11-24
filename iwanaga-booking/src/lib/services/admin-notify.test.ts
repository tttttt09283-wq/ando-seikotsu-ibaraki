import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/repo/memory";
import { setLineFetcher } from "@/lib/line/client";
import { createReservation } from "./reservations";
import { NOW, homeService, input, lineMock, openHome, setLineEnv } from "@/test/fixtures";

const ADMIN = "U" + "c".repeat(32);

describe("管理者への LINE 通知", () => {
  let line: ReturnType<typeof lineMock>;
  beforeEach(() => {
    setLineEnv(true);
    process.env.ADMIN_LINE_NOTIFY = "true";
    process.env.ADMIN_LINE_USER_IDS = ADMIN;
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.vercel.app";
    line = lineMock();
    setLineFetcher(line.fetcher);
  });
  afterEach(() => {
    setLineEnv(false);
    delete process.env.ADMIN_LINE_NOTIFY;
    delete process.env.ADMIN_LINE_USER_IDS;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    setLineFetcher(null);
  });

  it("管理者の LINE にはお名前・電話番号・ご相談内容と詳細リンクを載せ、管理画面の履歴には個人情報を残さない", async () => {
    const repo = new MemoryRepo();
    await openHome(repo);
    const svc = await homeService(repo);
    const r = await createReservation(repo, input({ service_id: svc.id, consultation: "首と肩のこり" }), { now: NOW });
    if (!r.ok) throw new Error(r.message);
    const push = line.calls.find((c) => c.body.to === ADMIN);
    const text = push!.body.messages[0].text;
    for (const s of ["【新規仮予約（LINE未確認）】", r.code, "お名前：山田 花子", "電話番号：09012345678", "ご相談内容：首と肩のこり", "https://example.vercel.app/admin/reservations/"]) {
      expect(text).toContain(s);
    }
    const logs = await repo.listNotifications({ recipient: "admin" });
    expect(JSON.stringify(logs)).not.toMatch(/山田|09012345678|首と肩/);
  });
});
