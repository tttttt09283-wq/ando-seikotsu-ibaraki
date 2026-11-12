import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repo } from "@/lib/repo/types";
import {
  cancelByCustomer,
  cancelReservation,
  confirmReservation,
  createReservation,
  expireHolds,
  getAdminReservationDetail,
  getAvailability,
  getCustomerView,
  getPublicCatalog,
  manualLineMatch,
  markNoticeSentManually,
  proposeChange,
  resendNotice,
  runRetention,
  completeReservation,
  OperationError,
  type CreateResult,
} from "@/lib/services/reservations";
import { processLineWebhook } from "@/lib/line/webhook";
import { computeLineSignature } from "@/lib/line/signature";
import { setLineFetcher } from "@/lib/line/client";
import { AuthorizationError } from "@/lib/auth/permissions";
import { NOW, DAY, OWNER, STAFF_PRIVATE_ONLY, LINE_USER, LINE_USER_2, homeService, input, lineMock, openHome, openWorkplace, setLineEnv } from "@/test/fixtures";
import { addMinutes } from "@/lib/time";

/** 同じシナリオをメモリ版・PostgreSQL版の両方で実行する */
export function defineFlowSuite(makeRepo: () => Promise<Repo>) {
  let repo: Repo;
  let line: ReturnType<typeof lineMock>;

  beforeEach(async () => {
    repo = await makeRepo();
    line = lineMock();
    setLineFetcher(line.fetcher);
    setLineEnv(true);
  });
  afterEach(() => {
    setLineFetcher(null);
    setLineEnv(false);
  });

  async function book(over: Record<string, unknown> = {}, now = NOW): Promise<Extract<CreateResult, { ok: true }>> {
    const svc = await homeService(repo);
    const r = await createReservation(repo, input({ service_id: svc.id, ...over }), { now });
    if (!r.ok) throw new Error(`booking failed: ${r.message} ${JSON.stringify(r.errors)}`);
    return r;
  }

  let evSeq = 0;
  function webhookBody(text: string, userId = LINE_USER, extra: Record<string, unknown> = {}) {
    evSeq++;
    return JSON.stringify({
      destination: process.env.LINE_BOT_USER_ID,
      events: [
        {
          type: "message",
          mode: "active",
          webhookEventId: `01HTEST${String(evSeq).padStart(10, "0")}`,
          timestamp: NOW.getTime(),
          replyToken: `reply-${evSeq}`,
          source: { type: "user", userId },
          message: { type: "text", id: String(evSeq), text },
          deliveryContext: { isRedelivery: false },
          ...extra,
        },
      ],
    });
  }
  const sign = (body: string) => computeLineSignature(process.env.LINE_CHANNEL_SECRET!, body);
  async function sendLine(text: string, userId = LINE_USER, now = NOW) {
    const body = webhookBody(text, userId);
    return processLineWebhook(repo, body, sign(body), now);
  }
  async function byCode(code: string) {
    return (await repo.getReservationByCode(code))!;
  }

  describe("受付の可否（開業準備・会社承認・料金承認）", () => {
    it("初期状態では3拠点とも受付せず、メニューも公開しない", async () => {
      const cat = await getPublicCatalog(repo);
      expect(cat.map((l) => [l.id, l.accepting])).toEqual([
        ["home", false],
        ["ibaraki", false],
        ["korien", false],
      ]);
      expect(cat.every((l) => l.services.length === 0)).toBe(true);
      // 自宅院の初期メニューは税込の提案価格として非公開で登録されている
      const svcs = await repo.listServices("home");
      expect(svcs.map((s) => [s.name, s.duration_minutes, s.price_tax_included, s.price_status, s.is_published])).toEqual([
        ["初回", 90, 12000, "proposed", false],
        ["通常", 60, 10000, "proposed", false],
        ["集中", 90, 15000, "proposed", false],
      ]);
      // 勤務先に仮の料金は登録されていない
      expect(await repo.listServices("ibaraki")).toEqual([]);
    });

    it("自宅院は開業準備完了まで予約できない（フォームを直接送っても拒否）", async () => {
      const svc = await homeService(repo);
      const r = await createReservation(repo, input({ service_id: svc.id }), { now: NOW });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("開業準備中");
      // 準備完了フラグなしに受付を有効にすることもできない
      await expect(repo.updateLocation("home", { booking_enabled: true })).rejects.toThrow(/locations_gate/);
    });

    it("勤務先は会社の正式承認まで予約できない", async () => {
      const svc = await repo.insertService({ location_id: "ibaraki", controller: "enejoy_hand", name: "鍼灸", description: "", duration_minutes: 60, price_tax_included: null, price_status: "proposed", price_approval_note: null, is_published: false, sort_order: 1 });
      const r = await createReservation(repo, input({ location_id: "ibaraki", service_id: svc.id }), { now: NOW });
      expect(r.ok).toBe(false);
      await expect(repo.updateLocation("ibaraki", { booking_enabled: true })).rejects.toThrow(/locations_gate/);
    });

    it("料金が未承認のメニューは公開できず、予約もできない", async () => {
      await repo.updateLocation("home", { opening_ready: true, booking_enabled: true });
      const svc = await homeService(repo);
      await expect(repo.updateService(svc.id, { is_published: true })).rejects.toThrow(/services_publish/);
      const r = await createReservation(repo, input({ service_id: svc.id }), { now: NOW });
      expect(r.ok).toBe(false);
    });

    it("勤務先のメニューを別拠点の予約に使えない", async () => {
      await openHome(repo);
      const w = await openWorkplace(repo, "ibaraki");
      const r = await createReservation(repo, input({ location_id: "home", service_id: w.id }), { now: NOW });
      expect(r.ok).toBe(false);
    });
  });

  describe("仮予約 → LINE受付確認 → 管理者承認", () => {
    beforeEach(() => openHome(repo));

    it("フォーム送信だけでは確定せず pending_line（LINE送信待ち）になる", async () => {
      const r = await book();
      const res = await byCode(r.code);
      expect(res.status).toBe("pending_line");
      expect(res.confirmed_at).toBeNull();
      expect(res.hold_expires_at).toBe(addMinutes(NOW, 30).toISOString());
      // サーバー側で予約番号を生成し、LINE で送る文面に予約番号と確認コードが入る
      expect(r.code).toMatch(/^IW-[2-9A-HJ-NP-Z]{6}$/);
      expect(r.linePrefill).toContain(r.code);
      expect(r.linePrefill).toContain(r.verifyCode);
      expect(r.lineUrl).toMatch(/^https:\/\/line\.me\/R\/oaMessage\/%40iwanaga\/\?/);
      // 個人情報は暗号化して保存
      const cust = await repo.getCustomer(res.customer_id);
      expect(cust!.name_enc).not.toContain("山田");
      expect(cust!.phone_enc).not.toContain("090");
      expect(res.consultation_enc).not.toContain("肩こり");
      // 同意の記録
      const consents = await repo.listConsents(res.id);
      expect(consents.map((c) => c.consent_type).sort()).toEqual(["cancel_policy", "privacy"]);
      // 利用者には仮予約であることを表示
      const view = await getCustomerView(repo, r.code, r.viewToken, NOW);
      expect(view!.provisional).toBe(true);
      expect(view!.lineReceived).toBe(false);
      expect(view!.statusLabel).toContain("仮予約");
      // 確定通知はまだ送っていない
      expect(line.calls.filter((c) => c.url.endsWith("/push") && c.body.to === LINE_USER)).toHaveLength(0);
    });

    it("管理者に新規仮予約を通知する（管理画面通知）", async () => {
      const r = await book();
      const notes = await repo.listNotifications({ recipient: "admin" });
      expect(notes.some((n) => n.kind === "new_hold" && n.channel === "admin_panel" && n.summary.includes(r.code))).toBe(true);
      // 管理者通知に電話番号・相談内容は含めない
      expect(notes.every((n) => !n.summary.includes("090") && !n.summary.includes("肩こり"))).toBe(true);
    });

    it("予約状況ページはトークンが違えば見られない", async () => {
      const r = await book();
      expect(await getCustomerView(repo, r.code, "wrong-token", NOW)).toBeNull();
    });

    it("LINE を開いただけ（メッセージ未受信）では pending_line のまま。承認もできない", async () => {
      const r = await book();
      const res = await byCode(r.code);
      await expect(confirmReservation(repo, OWNER, res.id, res.version, NOW)).rejects.toThrow(OperationError);
      expect((await byCode(r.code)).status).toBe("pending_line");
    });

    it("LINE で予約番号＋確認コードを受信したときだけ pending_review になり、返信する", async () => {
      const r = await book();
      const out = await sendLine(r.linePrefill);
      expect(out.status).toBe(200);
      expect(out.body.results![0].result).toBe("matched");
      const res = await byCode(r.code);
      expect(res.status).toBe("pending_review");
      expect(res.line_match_method).toBe("webhook");
      expect(res.line_received_at).toBe(NOW.toISOString());
      expect(await repo.getLineAccountByCustomer(res.customer_id)).not.toBeNull();
      const reply = line.calls.find((c) => c.url.endsWith("/reply"));
      expect(reply!.body.messages[0].text).toContain("まだ予約は確定していません");
      const view = await getCustomerView(repo, r.code, r.viewToken, NOW);
      expect(view!.lineReceived).toBe(true);
      expect(view!.provisional).toBe(true);
    });

    it("管理者の承認で confirmed になり、承認後にだけ確定メッセージを送る", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const before = line.calls.filter((c) => c.url.endsWith("/push")).length;
      const res = await byCode(r.code);
      const { reservation, notice } = await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      expect(reservation.status).toBe("confirmed");
      expect(reservation.confirmed_by).toBe(OWNER.email);
      expect(notice.status).toBe("sent");
      const pushes = line.calls.filter((c) => c.url.endsWith("/push")).slice(before);
      expect(pushes).toHaveLength(1);
      const text = pushes[0].body.messages[0].text;
      expect(pushes[0].body.to).toBe(LINE_USER);
      // 確定通知の記載事項
      for (const s of ["予約が確定", "岩永拓己 プライベート鍼灸院", "2026年11月16日(月) 10:00〜11:00", "通常", "10,000円（税込）", "60分", "注意事項", "変更・キャンセル"]) expect(text).toContain(s);
      expect(pushes[0].retryKey).toMatch(/^[0-9a-f-]{36}$/);
      const view = await getCustomerView(repo, r.code, r.viewToken, NOW);
      expect(view!.provisional).toBe(false);
    });

    it("自宅院の詳細住所は確定通知（本人宛て）にだけ記載し、公開情報には出さない", async () => {
      await repo.updateLocation("home", { private_address: "大阪府○○市1-2-3 ○○マンション101" });
      const cat = await getPublicCatalog(repo);
      expect(JSON.stringify(cat)).not.toContain("○○マンション");
      const r = await book();
      expect(r.linePrefill).not.toContain("○○マンション");
      await sendLine(r.linePrefill);
      expect(line.calls.find((c) => c.url.endsWith("/reply"))!.body.messages[0].text).not.toContain("○○マンション");
      const res = await byCode(r.code);
      await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      expect(line.calls.at(-1)!.body.messages[0].text).toContain("○○マンション101");
    });

    it("二重操作の防止：同じバージョンでの2回目の承認は拒否、同時押しでも確定通知は1回", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      const results = await Promise.allSettled([
        confirmReservation(repo, OWNER, res.id, res.version, NOW),
        confirmReservation(repo, OWNER, res.id, res.version, NOW),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
      expect(line.calls.filter((c) => c.url.endsWith("/push"))).toHaveLength(1);
    });

    it("確定は管理者だけ：権限のない管理者・別管理主体の担当者は承認できない", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      await expect(confirmReservation(repo, null, res.id, res.version, NOW)).rejects.toThrow(AuthorizationError);
      const workplaceOnly = { ...STAFF_PRIVATE_ONLY, allowed_controllers: ["enejoy_hand" as const] };
      await expect(confirmReservation(repo, workplaceOnly, res.id, res.version, NOW)).rejects.toThrow(AuthorizationError);
      await expect(getAdminReservationDetail(repo, workplaceOnly, res.id)).rejects.toThrow(AuthorizationError);
      expect((await byCode(r.code)).status).toBe("pending_review");
    });

    it("すべての状態変更が監査ログに残る", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      let res = await byCode(r.code);
      await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      res = await byCode(r.code);
      await completeReservation(repo, OWNER, res.id, res.version, new Date("2026-11-16T03:00:00Z"));
      const audit = (await repo.listAudit({ reservationId: res.id })).reverse();
      expect(audit.map((a) => [a.action, a.from_status, a.to_status])).toEqual([
        ["reservation_created", "draft", "pending_line"],
        ["line_received", "pending_line", "pending_review"],
        ["confirmed", "pending_review", "confirmed"],
        ["completed", "confirmed", "completed"],
      ]);
      expect(JSON.stringify(audit)).not.toContain("山田");
    });

    it("管理者の詳細画面では復号した氏名・電話・相談内容が見え、閲覧が記録される", async () => {
      const r = await book();
      const res = await byCode(r.code);
      const d = await getAdminReservationDetail(repo, OWNER, res.id);
      expect(d.customer).toMatchObject({ name: "山田 花子", phone: "09012345678" });
      expect(d.consultation).toBe("肩こり");
      expect((await repo.listAudit({ reservationId: res.id })).some((a) => a.action === "reservation_viewed")).toBe(true);
    });
  });

  describe("LINE Webhook のセキュリティ", () => {
    beforeEach(() => openHome(repo));

    it("署名が不正・改ざん・欠落なら 401 で何も処理しない", async () => {
      const r = await book();
      const body = webhookBody(r.linePrefill);
      expect((await processLineWebhook(repo, body, "invalid", NOW)).status).toBe(401);
      expect((await processLineWebhook(repo, body, null, NOW)).status).toBe(401);
      const tampered = body.replace("active", "active ");
      expect((await processLineWebhook(repo, tampered, sign(body), NOW)).status).toBe(401);
      expect((await byCode(r.code)).status).toBe("pending_line");
    });

    it("別チャネル宛て（destination 不一致）は処理しない", async () => {
      const r = await book();
      const body = webhookBody(r.linePrefill).replace(process.env.LINE_BOT_USER_ID!, "U" + "0".repeat(32));
      const out = await processLineWebhook(repo, body, sign(body), NOW);
      expect(out.status).toBe(403);
      expect((await byCode(r.code)).status).toBe("pending_line");
    });

    it("同じイベントの再送は1回だけ処理する（重複排除）", async () => {
      const r = await book();
      const body = webhookBody(r.linePrefill);
      const first = await processLineWebhook(repo, body, sign(body), NOW);
      const second = await processLineWebhook(repo, body, sign(body), NOW);
      expect(first.body.results![0].result).toBe("matched");
      expect(second.body.results![0].result).toBe("duplicate");
      expect(line.calls.filter((c) => c.url.endsWith("/reply"))).toHaveLength(1);
    });

    it("確認コードが違えば照合しない。5回失敗でロック", async () => {
      const r = await book();
      const wrong = r.linePrefill.replace(`確認コード：${r.verifyCode}`, `確認コード：${r.verifyCode === "000000" ? "111111" : "000000"}`);
      for (let i = 0; i < 5; i++) expect((await sendLine(wrong)).body.results![0].result).toBe("bad_code");
      expect((await sendLine(r.linePrefill)).body.results![0].result).toBe("locked");
      expect((await byCode(r.code)).status).toBe("pending_line");
    });

    it("予約番号のない普通のメッセージは無視する", async () => {
      expect((await sendLine("こんにちは")).body.results![0].result).toBe("no_code");
    });

    it("グループからのメッセージは照合しない（1対1のユーザーのみ）", async () => {
      const r = await book();
      const body = webhookBody(r.linePrefill, LINE_USER, { source: { type: "group", userId: LINE_USER } });
      const out = await processLineWebhook(repo, body, sign(body), NOW);
      expect(out.body.results![0].result).toBe("ignored");
      expect((await byCode(r.code)).status).toBe("pending_line");
    });

    it("LIFF で本人確認した予約は、同じ LINE ユーザーからの送信だけ受け付ける（送信元照合）", async () => {
      const svc = await homeService(repo);
      const r = await createReservation(repo, input({ service_id: svc.id, liff_id_token: "token" }), { now: NOW, verifyLiff: async () => LINE_USER });
      if (!r.ok) throw new Error(r.message);
      expect((await sendLine(r.linePrefill, LINE_USER_2)).body.results![0].result).toBe("liff_mismatch");
      expect((await byCode(r.code)).status).toBe("pending_line");
      expect((await sendLine(r.linePrefill, LINE_USER)).body.results![0].result).toBe("matched");
    });

    it("LINE 未設定なら Webhook は 503（自動確認しない）", async () => {
      setLineEnv(false);
      const out = await processLineWebhook(repo, "{}", "x", NOW);
      expect(out.status).toBe(503);
    });
  });

  describe("LINE 未設定時のフォールバック・手動照合", () => {
    beforeEach(async () => {
      setLineEnv(false);
      await openHome(repo);
    });

    it("LINE 自動確認なしで受け付け、送信確認済みとは表示しない", async () => {
      const r = await book();
      expect(r.lineAutoConfirm).toBe(false);
      expect(r.lineUrl).toBeNull(); // ベーシックIDも未設定
      expect(r.linePrefill).toContain(r.code); // コピー用の文面は出す
      const view = await getCustomerView(repo, r.code, r.viewToken, NOW);
      expect(view!.lineReceived).toBe(false);
    });

    it("管理者が手動で LINE 受信を照合 → 承認。確定通知は手動送信が必要として記録", async () => {
      const r = await book();
      let res = await byCode(r.code);
      await expect(manualLineMatch(repo, OWNER, res.id, res.version, "", NOW)).rejects.toThrow(/照合メモ/);
      await manualLineMatch(repo, OWNER, res.id, res.version, "LINEトーク「山田」11/12 9:05 受信", NOW);
      res = await byCode(r.code);
      expect(res.status).toBe("pending_review");
      expect(res.line_match_method).toBe("manual");
      const { notice } = await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      expect(notice.status).toBe("manual_required");
      expect((await byCode(r.code)).notice_status).toBe("manual_required");
      await markNoticeSentManually(repo, OWNER, res.id);
      expect((await byCode(r.code)).notice_status).toBe("sent");
    });
  });

  describe("通知失敗と再送", () => {
    beforeEach(() => openHome(repo));

    it("LINE 送信に失敗しても予約は確定のまま。通知ステータスは failed で、再送できる", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      line.state.fail = true;
      const { reservation, notice } = await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      expect(notice.status).toBe("failed");
      expect(reservation.status).toBe("confirmed");
      let cur = await byCode(r.code);
      expect(cur.status).toBe("confirmed");
      expect(cur.notice_status).toBe("failed");
      const failedLog = (await repo.listNotifications({ reservationId: res.id, recipient: "customer" })).find((n) => n.kind === "confirmed");
      expect(failedLog!.status).toBe("failed");
      expect(failedLog!.error).toContain("500");

      line.state.fail = false;
      const again = await resendNotice(repo, OWNER, res.id);
      expect(again.status).toBe("sent");
      cur = await byCode(r.code);
      expect(cur.notice_status).toBe("sent");
      expect(cur.version).toBe(reservation.version); // 再送で予約のバージョン・状態は変わらない
      const logs = (await repo.listNotifications({ reservationId: res.id, recipient: "customer" })).filter((n) => n.kind === "confirmed");
      expect(logs.map((l) => [l.status, l.attempt]).sort()).toEqual([
        ["failed", 1],
        ["sent", 2],
      ]);
      // 同じ確定通知の再送は同じ再送キー（LINE 側で二重送信されない）
      const pushes = line.calls.filter((c) => c.url.endsWith("/push"));
      expect(pushes.at(-1)!.retryKey).toBe(pushes.at(-2)!.retryKey);
    });

    it("確定前の予約に確定通知を再送することはできない", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      await expect(resendNotice(repo, OWNER, res.id)).rejects.toThrow(OperationError);
    });
  });

  describe("期限付きホールドと期限切れ", () => {
    beforeEach(() => openHome(repo));

    it("LINE 送信待ちのホールドは期限（30分）で自動解放され、同じ枠を予約できる", async () => {
      const r = await book();
      const svc = await homeService(repo);
      const blocked = await createReservation(repo, input({ service_id: svc.id, phone: "08011112222" }), { now: addMinutes(NOW, 10) });
      expect(blocked.ok).toBe(false);
      const later = addMinutes(NOW, 31);
      expect(await expireHolds(repo, later)).toBe(1);
      expect((await byCode(r.code)).status).toBe("expired");
      const again = await createReservation(repo, input({ service_id: svc.id, phone: "08011112222" }), { now: later });
      expect(again.ok).toBe(true);
      // 期限切れの監査ログ・管理者通知
      const res = await byCode(r.code);
      expect((await repo.listAudit({ reservationId: res.id })).some((a) => a.action === "hold_expired")).toBe(true);
    });

    it("期限切れ後に LINE が届いても仮予約は復活しない", async () => {
      const r = await book();
      const out = await sendLine(r.linePrefill, LINE_USER, addMinutes(NOW, 45));
      expect(out.body.results![0].result).toBe("expired");
      expect((await byCode(r.code)).status).toBe("expired");
    });

    it("空き枠の取得でも期限切れのホールドは枠を塞がない", async () => {
      await book();
      const svc = await homeService(repo);
      const during = await getAvailability(repo, "home", svc.id, DAY, addMinutes(NOW, 5));
      expect(during.ok && during.slots.includes("10:00")).toBe(false);
      const after = await getAvailability(repo, "home", svc.id, DAY, addMinutes(NOW, 40));
      expect(after.ok && after.slots.includes("10:00")).toBe(true);
    });

    it("確認待ち（pending_review）は 48時間で期限切れになる", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      expect(res.hold_expires_at).toBe(addMinutes(NOW, 48 * 60).toISOString());
      await expireHolds(repo, addMinutes(NOW, 48 * 60 + 1));
      expect((await byCode(r.code)).status).toBe("expired");
    });

    it("確定済みの予約は期限切れにならない", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      const res = await byCode(r.code);
      await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      await expireHolds(repo, addMinutes(NOW, 60 * 24 * 10));
      expect((await byCode(r.code)).status).toBe("confirmed");
    });
  });

  describe("予約競合（同時送信・別拠点・変更提案）", () => {
    beforeEach(() => openHome(repo));

    it("同じ枠に10件同時に送信しても、仮予約できるのは1件だけ", async () => {
      const svc = await homeService(repo);
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => createReservation(repo, input({ service_id: svc.id, phone: `0901234${String(i).padStart(4, "0")}` }), { now: NOW })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok).every((r) => !r.ok && /埋まり|埋まっ/.test(r.message))).toBe(true);
    });

    it("別拠点（茨木）と自宅の同時刻・移動時間内の予約は同時送信でも1件だけ", async () => {
      const w = await openWorkplace(repo, "ibaraki");
      const svc = await homeService(repo);
      const results = await Promise.all([
        createReservation(repo, input({ service_id: svc.id, time: "13:00" }), { now: NOW }),
        createReservation(repo, input({ location_id: "ibaraki", service_id: w.id, time: "14:00", phone: "08099998888" }), { now: NOW }),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    });

    it("日時変更の提案は空いている枠だけ。提案中は元の枠を解放する", async () => {
      const r1 = await book({ time: "10:00" });
      const r2 = await book({ time: "14:00", phone: "08033334444" });
      await sendLine(r1.linePrefill);
      let res1 = await byCode(r1.code);
      await expect(proposeChange(repo, OWNER, res1.id, res1.version, DAY, "14:30", NOW)).rejects.toThrow(/重なります/);
      const { reservation, notice } = await proposeChange(repo, OWNER, res1.id, res1.version, DAY, "16:00", NOW);
      expect(reservation.status).toBe("change_proposed");
      expect(reservation.previous_start_at).toBe(res1.start_at);
      expect(notice.status).toBe("sent");
      expect(line.calls.at(-1)!.body.messages[0].text).toContain("日時変更のご相談");
      // 元の 10:00 は空く
      const svc = await homeService(repo);
      const avail = await getAvailability(repo, "home", svc.id, DAY, NOW);
      expect(avail.ok && avail.slots.includes("10:00")).toBe(true);
      // 利用者の承諾をLINEで確認後、管理者が確定
      res1 = await byCode(r1.code);
      const done = await confirmReservation(repo, OWNER, res1.id, res1.version, NOW);
      expect(done.reservation.status).toBe("confirmed");
      expect(r2.code).not.toBe(r1.code);
    });

    it("キャンセルで枠が空き、利用者にキャンセルを通知できる", async () => {
      const r = await book();
      await sendLine(r.linePrefill);
      let res = await byCode(r.code);
      await confirmReservation(repo, OWNER, res.id, res.version, NOW);
      res = await byCode(r.code);
      const { notice } = await cancelReservation(repo, OWNER, res.id, res.version, "施術者の体調不良", true, NOW);
      expect(notice.status).toBe("sent");
      expect((await byCode(r.code)).status).toBe("cancelled");
      const svc = await homeService(repo);
      const avail = await getAvailability(repo, "home", svc.id, DAY, NOW);
      expect(avail.ok && avail.slots.includes("10:00")).toBe(true);
    });

    it("利用者は確定前の仮予約だけ取り消せる", async () => {
      const r = await book();
      expect((await cancelByCustomer(repo, r.code, "bad", NOW)).ok).toBe(false);
      expect((await cancelByCustomer(repo, r.code, r.viewToken, NOW)).ok).toBe(true);
      expect((await byCode(r.code)).status).toBe("cancelled");
    });
  });

  describe("個人情報：事業間の分離・保持期間", () => {
    it("同じ電話番号でも施術場所ごとに別の顧客として管理する（事業をまたいで名寄せしない）", async () => {
      await openHome(repo);
      const w = await openWorkplace(repo, "ibaraki");
      const a = await book({ time: "10:00" });
      const svcB = await createReservation(repo, input({ location_id: "ibaraki", service_id: w.id, date: "2026-11-17", time: "10:00" }), { now: NOW });
      if (!svcB.ok) throw new Error(svcB.message);
      const ra = await byCode(a.code);
      const rb = await byCode(svcB.code);
      expect(ra.customer_id).not.toBe(rb.customer_id);
      expect(ra.controller).toBe("iwanaga_private");
      expect(rb.controller).toBe("enejoy_hand");
      expect(rb.location_id).toBe("ibaraki");
    });

    it("保持期間を過ぎた相談内容を削除し、顧客情報を匿名化する", async () => {
      await openHome(repo);
      const r = await book();
      let res = await byCode(r.code);
      await cancelReservation(repo, OWNER, res.id, res.version, "", false, NOW);
      const later = addMinutes(NOW, 60 * 24 * 365 * 4);
      const out = await runRetention(repo, later);
      expect(out).toEqual({ consultations: 1, customers: 1 });
      res = await byCode(r.code);
      expect(res.consultation_enc).toBeNull();
      const c = await repo.getCustomer(res.customer_id);
      expect(c!.anonymized_at).not.toBeNull();
      expect(c!.name_enc).toBe("");
    });
  });
}
