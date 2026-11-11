import { beforeEach, describe, expect, it } from "vitest";
import { generateFollowupTasks } from "@/lib/followup/generate";
import { adminClient, IDS, signIn, sql } from "../support/db";

/**
 * 抽出テスト専用の組織を毎回作り直す（seed データに依存しない）。
 * 基準日 asOf = 2026-11-11。
 */
const AS_OF = "2026-11-11";
let org: string;
let store: string;

async function setupOrg() {
  const db = sql();
  const slug = `fu-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  org = (await db.query("insert into organizations (name, slug) values ('抽出テスト', $1) returning id", [slug])).rows[0].id;
  store = (await db.query("insert into stores (organization_id, name, code) values ($1, '店', 'S1') returning id", [org])).rows[0].id;
  await db.query(
    `insert into followup_rules (organization_id, name, rule_type, offset_days, due_in_days, max_lookback_days, task_kind, priority)
     values ($1, '初回お礼', 'days_since_first_visit', 1, 2, 14, 'contact', 'high'),
            ($1, '7日後', 'days_since_last_visit', 7, 3, 14, 'contact', 'normal'),
            ($1, '予約確認', 'no_confirmed_next_appointment', 3, 3, 14, 'internal', 'normal')`,
    [org],
  );
}

async function customer(code: string, visits: string[], consent: "granted" | "unsubscribed" | "not_allowed" | null = "granted") {
  const db = sql();
  const id = (
    await db.query("insert into customers (organization_id, store_id, customer_code, family_name) values ($1, $2, $3, 'テスト') returning id", [
      org,
      store,
      code,
    ])
  ).rows[0].id as string;
  for (const v of visits) {
    await db.query("insert into visits (organization_id, store_id, customer_id, visited_on) values ($1, $2, $3, $4)", [org, store, id, v]);
  }
  if (consent) {
    await db.query("insert into consent_records (organization_id, customer_id, status) values ($1, $2, $3)", [org, id, consent]);
  }
  return id;
}

async function tasksOf(customerId: string) {
  const { rows } = await sql().query(
    `select t.title, t.status, t.period_key, t.due_on::text, t.close_reason, t.task_kind
     from followup_tasks t where t.customer_id = $1 order by t.title, t.period_key`,
    [customerId],
  );
  return rows;
}

const run = (asOf = AS_OF) => generateFollowupTasks(adminClient() as never, { organizationId: org, asOf });

describe("フォロータスクの抽出", () => {
  beforeEach(setupOrg);

  it("ルールに合致する顧客のタスクを生成する", async () => {
    const first = await customer("A", ["2026-11-10"]); // 昨日初回来店 → 初回お礼
    const week = await customer("B", ["2026-10-01", "2026-11-04"]); // 7日前来店 → 7日後、予約確認
    const none = await customer("C", ["2026-11-09"]); // 2日前（初回お礼の対象期間外は lookback 内なので対象）
    const r = await run();

    expect((await tasksOf(first)).map((t) => t.title)).toEqual(["初回お礼"]);
    expect(await tasksOf(week)).toEqual([
      { title: "7日後", status: "open", period_key: "lv:2026-11-04", due_on: "2026-11-14", close_reason: null, task_kind: "contact" },
      { title: "予約確認", status: "open", period_key: "na:2026-11-04", due_on: "2026-11-14", close_reason: null, task_kind: "internal" },
    ]);
    expect((await tasksOf(none)).map((t) => t.title)).toEqual(["初回お礼"]);
    expect(r.created).toBe(4);
  });

  it("将来の予約がある顧客には「予約確認」を生成しない", async () => {
    const id = await customer("D", ["2026-11-04"]);
    await sql().query(
      "insert into appointments (organization_id, store_id, customer_id, scheduled_at) values ($1, $2, $3, '2026-11-20 10:00+09')",
      [org, store, id],
    );
    await run();
    expect((await tasksOf(id)).map((t) => t.title)).not.toContain("予約確認");
  });

  it("キャンセルされた予約・過去の予約は「予約あり」とみなさない", async () => {
    const id = await customer("E", ["2026-11-04"]);
    await sql().query(
      `insert into appointments (organization_id, store_id, customer_id, scheduled_at, status)
       values ($1, $2, $3, '2026-11-20 10:00+09', 'cancelled'), ($1, $2, $3, '2026-11-05 10:00+09', 'scheduled')`,
      [org, store, id],
    );
    await run();
    expect((await tasksOf(id)).map((t) => t.title)).toContain("予約確認");
  });
});

describe("タスク重複防止", () => {
  beforeEach(setupOrg);

  it("同じ日に2回実行しても重複しない", async () => {
    const id = await customer("A", ["2026-09-01", "2026-11-04"]);
    const r1 = await run();
    const r2 = await run();
    expect(r1.created).toBe(2);
    expect(r2.created).toBe(0);
    expect(r2.alreadyExisted).toBe(2);
    expect(await tasksOf(id)).toHaveLength(2);
  });

  it("翌日以降に実行しても同じ対象期間なら重複しない", async () => {
    const id = await customer("A", ["2026-09-01", "2026-11-04"]);
    await run("2026-11-11");
    await run("2026-11-12");
    await run("2026-11-15");
    expect(await tasksOf(id)).toHaveLength(2);
  });

  it("同時に並行実行しても重複しない", async () => {
    const ids = await Promise.all(["P1", "P2", "P3", "P4", "P5"].map((c) => customer(c, ["2026-09-01", "2026-11-04"])));
    await Promise.all([run(), run(), run(), run()]);
    for (const id of ids) expect(await tasksOf(id)).toHaveLength(2);
  });

  it("DB の一意制約で、同じ顧客・ルール・対象期間のタスクは直接挿入しても重複できない", async () => {
    const id = await customer("A", ["2026-09-01", "2026-11-04"]);
    await run();
    const { rows } = await sql().query("select rule_id, period_key from followup_tasks where customer_id = $1 limit 1", [id]);
    await expect(
      sql().query(
        "insert into followup_tasks (organization_id, store_id, customer_id, rule_id, period_key, title, due_on) values ($1,$2,$3,$4,$5,'x','2026-11-11')",
        [org, store, id, rows[0].rule_id, rows[0].period_key],
      ),
    ).rejects.toThrow(/followup_tasks_dedupe/);
  });

  it("再来店した場合は新しい対象期間としてタスクを生成でき、旧タスクは条件解消で対象外になる", async () => {
    const id = await customer("A", ["2026-09-01", "2026-11-04"]);
    await run("2026-11-11");
    await sql().query("insert into visits (organization_id, store_id, customer_id, visited_on) values ($1,$2,$3,'2026-11-12')", [org, store, id]);
    const r = await run("2026-11-19");
    const tasks = await tasksOf(id);
    expect(tasks.filter((t) => t.title === "7日後")).toEqual([
      expect.objectContaining({ period_key: "lv:2026-11-04", status: "not_applicable", close_reason: "condition_resolved" }),
      expect.objectContaining({ period_key: "lv:2026-11-12", status: "open" }),
    ]);
    expect(r.resolved).toBeGreaterThanOrEqual(1);
  });
});

describe("連絡不可顧客の除外", () => {
  beforeEach(setupOrg);

  it("配信停止・連絡不可の顧客には連絡タスクを生成しない（社内作業タスクは生成する）", async () => {
    const unsub = await customer("U", ["2026-09-01", "2026-11-04"], "unsubscribed");
    const ng = await customer("N", ["2026-09-01", "2026-11-04"], "not_allowed");
    const r = await run();
    for (const id of [unsub, ng]) {
      expect((await tasksOf(id)).map((t) => t.task_kind)).toEqual(["internal"]);
    }
    // 連絡ルール2本 × 顧客2名
    expect(r.skipped.contact_not_allowed).toBe(4);
  });

  it("同意未確認の顧客は既定で除外し、組織設定で対象にできる", async () => {
    const id = await customer("Q", ["2026-09-01", "2026-11-04"], null);
    await run();
    expect((await tasksOf(id)).map((t) => t.task_kind)).toEqual(["internal"]);
    await sql().query(`update organizations set settings = settings || '{"include_unknown_consent": true}' where id = $1`, [org]);
    await run();
    expect((await tasksOf(id)).map((t) => t.task_kind).sort()).toEqual(["contact", "internal"]);
  });

  it("配信停止を記録すると、未対応・保留の連絡タスクは自動で対象外になる", async () => {
    const id = await customer("S", ["2026-09-01", "2026-11-04"]);
    await run();
    await sql().query("update followup_tasks set status = 'on_hold' where customer_id = $1 and task_kind = 'contact'", [id]);
    await sql().query("insert into consent_records (organization_id, customer_id, status) values ($1, $2, 'unsubscribed')", [org, id]);
    const tasks = await tasksOf(id);
    expect(tasks.find((t) => t.task_kind === "contact")).toMatchObject({ status: "not_applicable", close_reason: "contact_not_allowed" });
    expect(tasks.find((t) => t.task_kind === "internal")).toMatchObject({ status: "open" });
    const { rows } = await sql().query("select contact_status from customers where id = $1", [id]);
    expect(rows[0].contact_status).toBe("unsubscribed");
  });

  it("停止中の組織ではタスクを生成しない", async () => {
    const id = await customer("Z", ["2026-09-01", "2026-11-04"]);
    await sql().query("update organizations set status = 'suspended' where id = $1", [org]);
    const r = await run();
    expect(r.created).toBe(0);
    expect(await tasksOf(id)).toHaveLength(0);
  });
});

describe("タスク対応の記録", () => {
  it("対応記録とステータス更新が同時に行われ、完了日時・完了者が記録される", async () => {
    const { rows } = await sql().query(
      `insert into followup_tasks (organization_id, store_id, customer_id, title, due_on)
       select organization_id, store_id, id, '記録テスト', current_date from customers
       where store_id = $1 and deleted_at is null order by customer_code limit 1 returning id, customer_id`,
      [IDS.stores.hq],
    );
    const staff = await signIn("staff");
    const { error } = await staff.rpc("record_task_action", {
      p_task: rows[0].id,
      p_status: "done",
      p_channel: "line_manual",
      p_outcome: "sent",
      p_content: "お礼メッセージを送信",
    });
    expect(error).toBeNull();
    const task = (await sql().query("select status, completed_by, completed_at from followup_tasks where id = $1", [rows[0].id])).rows[0];
    expect(task.status).toBe("done");
    expect(task.completed_by).toBe(IDS.users.staff);
    const log = (await sql().query("select channel, outcome, staff_id from contact_logs where task_id = $1", [rows[0].id])).rows[0];
    expect(log).toEqual({ channel: "line_manual", outcome: "sent", staff_id: IDS.users.staff });
  });

  it("他店舗のタスクには記録できない", async () => {
    const { rows } = await sql().query(
      `insert into followup_tasks (organization_id, store_id, customer_id, title, due_on)
       select organization_id, store_id, id, '他店舗', current_date from customers
       where store_id = $1 and deleted_at is null limit 1 returning id`,
      [IDS.stores.hq],
    );
    const staff2 = await signIn("staff2");
    const { error } = await staff2.rpc("record_task_action", { p_task: rows[0].id, p_status: "done" });
    expect(error).not.toBeNull();
  });
});
