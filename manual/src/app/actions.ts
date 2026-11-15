"use server";
// 画面からの操作はすべてここを通る。ログインの確認 → 入力のチェック（zod）→ 権限の確認（repo の中で authz）→ DB
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearSession, devLoginEnabled, getActor, requireActor, setSession } from "@/lib/auth";
import { canAdmin, type ReviewAction } from "@/lib/authz";
import { CATEGORY_IDS, CLINIC_IDS, clinicIdFromLedger, KINDS, POSITIONS } from "@/lib/config";
import { sql, tx } from "@/lib/db";
import { parseManual } from "@/lib/importer";
import * as docs from "@/lib/repo/docs";
import * as members from "@/lib/repo/members";

export type FormState = { error?: string; ok?: string } | undefined;

const fail = (e: unknown): FormState => {
  if (e instanceof members.RuleError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues.map((i) => i.message).join("／") };
  console.error(e);
  return { error: "処理できませんでした。時間をおいてもう一度お試しください" };
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を正しく入れてください");

// ===== ログイン =====
export async function loginClinic(_: unknown, f: FormData) {
  const { clinicStep, isLoginError } = await import("@/lib/legacy");
  try {
    const r = await clinicStep(str(f, "id"), str(f, "pass"));
    return { step: "person" as const, clinic: r.clinic, staff: r.staff, clinicToken: r.clinicToken };
  } catch (e) {
    return { step: "clinic" as const, error: isLoginError(e) ? e.message : "ログインできませんでした。時間をおいてお試しください" };
  }
}

export async function loginPerson(_: unknown, f: FormData): Promise<FormState> {
  const { personStep, isLoginError } = await import("@/lib/legacy");
  let ok = false;
  try {
    const r = await personStep(str(f, "clinicToken"), str(f, "personKey"), str(f, "pass"));
    const m = await members.memberByPersonKey(sql(), r.key);
    if (!m || !(await members.loadActor(sql(), m.id, "pin"))) return { error: "マニュアルシステムに登録されていないか、所属が設定されていません。院長・GMに連絡してください" };
    await setSession({ m: m.id, via: "pin", k: r.key, h: r.stamp });
    ok = true;
  } catch (e) {
    return { error: isLoginError(e) ? e.message : "ログインできませんでした。時間をおいてお試しください" };
  }
  if (ok) redirect("/");
}

export async function loginEmail(_: unknown, f: FormData): Promise<FormState> {
  const { emailPasswordLogin, isLoginError, normName } = await import("@/lib/legacy");
  let ok = false;
  try {
    const r = await emailPasswordLogin(str(f, "email"), String(f.get("password") ?? ""));
    const m = await tx(null, (q) => members.linkEmailMember(q, r.uid, r.staff, r.staff ? normName(r.staff.name) : null));
    if (!m || !(await members.loadActor(sql(), m.id, "email"))) return { error: "マニュアルシステムに登録されていないか、所属が設定されていません。GMに連絡してください" };
    await setSession({ m: m.id, via: "email" });
    ok = true;
  } catch (e) {
    return { error: isLoginError(e) ? e.message : "ログインできませんでした。時間をおいてお試しください" };
  }
  if (ok) redirect("/");
}

export async function loginDev(f: FormData) {
  if (!devLoginEnabled()) throw new Error("開発用ログインは使えません");
  await setSession({ m: str(f, "member"), via: "dev" });
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/login");
}

// ===== ルール・マニュアル =====
const versionSchema = z.object({
  title: z.string().trim().min(1, "タイトルを入れてください").max(120, "タイトルは120文字までです"),
  body: z.string().trim().min(1, "内容を入れてください").max(20000, "内容は20,000文字までです"),
  category: z.enum(CATEGORY_IDS, { message: "カテゴリを選んでください" }),
  importance: z.enum(["A", "B", "C"], { message: "重要度を選んでください" }),
  targetPositions: z.array(z.enum(POSITIONS)),
  targetClinics: z.array(z.string().refine((c) => CLINIC_IDS.includes(c), "院が正しくありません")),
  effectiveOn: date.nullable(),
  changeSummary: z.string().trim().max(500, "変更の理由は500文字までです"),
  requiresReack: z.boolean(),
});

const readVersion = (f: FormData): docs.VersionInput =>
  versionSchema.parse({
    title: str(f, "title"),
    body: String(f.get("body") ?? ""),
    category: str(f, "category"),
    importance: str(f, "importance"),
    targetPositions: f.getAll("targetPositions").map(String),
    targetClinics: f.getAll("targetClinics").map(String),
    effectiveOn: str(f, "effectiveOn") || null,
    changeSummary: str(f, "changeSummary"),
    requiresReack: f.get("requiresReack") === "on",
  });

export async function proposeDoc(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  let code = "";
  try {
    const kind = z.enum(KINDS).parse(str(f, "kind"));
    const input = readVersion(f);
    const conflictCode = str(f, "conflictCode");
    const conflict = conflictCode ? { docCode: conflictCode, note: str(f, "conflictNote") } : null;
    code = await tx(a.memberId, (q) => docs.createProposal(q, a, kind, input, conflict));
  } catch (e) {
    return fail(e);
  }
  redirect(`/docs/${code}`);
}

export async function saveVersion(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  let code = "";
  try {
    const input = readVersion(f);
    code = await tx(a.memberId, (q) => docs.updateVersion(q, a, str(f, "versionId"), input));
  } catch (e) {
    return fail(e);
  }
  redirect(`/docs/${code}`);
}

export async function reviseDoc(f: FormData) {
  const a = await requireActor();
  const code = str(f, "code");
  await tx(a.memberId, (q) => docs.createRevision(q, a, code));
  redirect(`/docs/${code}/edit`);
}

const ACTIONS = ["submit", "gm_approve", "president_approve", "return", "legal_hold", "legal_clear", "archive"] as const;

export async function reviewDoc(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  let done = "";
  try {
    const action = z.enum(ACTIONS).parse(str(f, "action")) as ReviewAction;
    const code = await tx(a.memberId, (q) =>
      docs.review(q, a, str(f, "versionId"), action, {
        comment: str(f, "comment"),
        externalReviewer: str(f, "externalReviewer"),
        externalCheckedOn: str(f, "externalCheckedOn") || undefined,
      }),
    );
    revalidatePath("/review");
    done = `/docs/${code}?done=${action}`;
  } catch (e) {
    return fail(e);
  }
  // 操作のあとはボタンが変わる（消える）ので、結果は画面の上に出す
  redirect(done);
}

// まとめて GM確認OK／社長承認（一覧画面のチェック）
export async function bulkReview(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  const action = str(f, "action") === "president_approve" ? "president_approve" : "gm_approve";
  const ids = f.getAll("versionId").map(String).slice(0, 100);
  if (!ids.length) return { error: "項目を選んでください" };
  const done: string[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    try {
      done.push(await tx(a.memberId, (q) => docs.review(q, a, id, action, { comment: str(f, "comment") })));
    } catch (e) {
      errors.push(fail(e)?.error ?? "");
    }
  }
  revalidatePath("/review");
  return errors.length ? { error: `${done.length}件 記録、${errors.length}件 できませんでした：${[...new Set(errors)].join("／")}` } : { ok: `${done.length}件 記録しました` };
}

export async function ackDoc(f: FormData) {
  const a = await requireActor();
  const code = await tx(a.memberId, (q) => docs.ackVersion(q, a, str(f, "versionId")));
  revalidatePath(`/docs/${code}`);
  revalidatePath("/");
}

export async function addConflictAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  try {
    await tx(a.memberId, (q) => docs.addConflict(q, a, str(f, "versionId"), str(f, "conflictCode"), str(f, "note")));
    revalidatePath(`/docs/${str(f, "code")}`);
    return { ok: "矛盾を記録しました（解決するまで公開できません）" };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveConflictAction(_: FormState, f: FormData): Promise<FormState> {
  const a = await requireActor();
  try {
    await tx(a.memberId, (q) => docs.resolveConflict(q, a, str(f, "conflictId"), str(f, "resolution")));
    revalidatePath(`/docs/${str(f, "code")}`);
    return { ok: "解決を記録しました" };
  } catch (e) {
    return fail(e);
  }
}

export async function readAllNotifications() {
  const a = await requireActor();
  await sql()`update mn_notifications set read_at = now() where member_id = ${a.memberId} and read_at is null and kind <> 'ack'`;
  revalidatePath("/notifications");
}

// ===== 管理者設定 =====
async function requireAdmin() {
  const a = await getActor();
  if (!a || !canAdmin(a)) throw new members.RuleError("管理者設定は社長・GM・管理者（メールアドレスでログイン）だけが使えます");
  return a;
}

export async function importManualAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const file = f.get("file");
    const pasted = String(f.get("text") ?? "");
    const raw = file instanceof File && file.size ? await file.text() : pasted;
    if (!raw.trim()) return { error: "書き出したファイルを選ぶか、本文を貼り付けてください" };
    if (raw.length > 500_000) return { error: "ファイルが大きすぎます" };
    const parsed = parseManual(raw);
    if (parsed.sections.length < 40) return { error: `見出しが ${parsed.sections.length} 件しか見つかりません。「整骨院スタッフ業務・行動マニュアル」の書き出しか確認してください` };
    const r = await tx(a.memberId, (q) => docs.importManual(q, a, parsed));
    revalidatePath("/review");
    const notes = [
      `${r.created.length}件を登録しました（すでにある項目は変更していません）`,
      parsed.missingSections.length ? `見つからなかった項目：${parsed.missingSections.join("、")}` : "",
      parsed.rules.some((x) => x.missing.length) ? `ルールにできなかった候補：${parsed.rules.filter((x) => x.missing.length).map((x) => x.code).join("、")}` : "",
      r.changed.length ? `原文が前回の取り込みと違う項目（上書きしていません。GM確認）：${r.changed.join("、")}` : "",
    ].filter(Boolean);
    return { ok: notes.join("\n") };
  } catch (e) {
    return fail(e);
  }
}

export async function syncMembersAction(_: FormState): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const { ledgerPeople } = await import("@/lib/legacy");
    const people = await ledgerPeople(true);
    const r = await tx(a.memberId, (q) => members.syncFromLedger(q, people, clinicIdFromLedger));
    revalidatePath("/admin");
    return {
      ok: [
        `追加：${r.added.length}人${r.added.length ? `（${r.added.join("、")}）` : ""}`,
        `所属を作成：${r.assigned.length}人`,
        r.notInLedger.length ? `台帳にいない在籍者（退職か確認してください）：${r.notInLedger.join("、")}` : "",
      ].filter(Boolean).join("\n"),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function addMemberAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const { normName } = await import("@/lib/legacy");
    const name = z.string().trim().min(1, "氏名を入れてください").max(40).parse(str(f, "name"));
    const emp = z.enum(["regular", "part_time"]).parse(str(f, "employmentType") || "regular");
    await tx(a.memberId, (q) => members.addMember(q, { name, personKey: normName(name), employmentType: emp, joinedOn: str(f, "joinedOn") || null }));
    revalidatePath("/admin");
    return { ok: `${name} さんを登録しました。所属を設定してください` };
  } catch (e) {
    return fail(e);
  }
}

export async function addAssignmentAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const input = z.object({
      memberId: z.string().uuid(),
      position: z.enum(POSITIONS),
      clinicId: z.string().nullable(),
      isPrimary: z.boolean(),
      validFrom: date,
    }).parse({ memberId: str(f, "memberId"), position: str(f, "position"), clinicId: str(f, "clinicId") || null, isPrimary: f.get("isPrimary") === "on", validFrom: str(f, "validFrom") });
    if (input.clinicId && !CLINIC_IDS.includes(input.clinicId)) return { error: "院が正しくありません" };
    await tx(a.memberId, (q) => members.addAssignment(q, a, input));
    revalidatePath("/admin");
    return { ok: "所属を追加しました" };
  } catch (e) {
    return fail(e);
  }
}

export async function endAssignmentAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    await tx(a.memberId, (q) => members.endAssignment(q, a, str(f, "assignmentId"), date.parse(str(f, "validTo"))));
    revalidatePath("/admin");
    return { ok: "所属を終了しました" };
  } catch (e) {
    return fail(e);
  }
}

export async function setAreaAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const clinics = f.getAll("clinicId").map(String).filter((c) => CLINIC_IDS.includes(c));
    if (!clinics.length) return { error: "担当する院を選んでください" };
    const validFrom = date.parse(str(f, "validFrom"));
    await tx(a.memberId, async (q) => {
      for (const c of clinics) await members.setArea(q, { memberId: str(f, "memberId"), clinicId: c, validFrom });
    });
    revalidatePath("/admin");
    return { ok: "担当エリアを設定しました" };
  } catch (e) {
    return fail(e);
  }
}

export async function addDelegationAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    await tx(a.memberId, (q) => members.addDelegation(q, a, {
      fromMember: str(f, "fromMember"), toMember: str(f, "toMember"), validFrom: date.parse(str(f, "validFrom")), validTo: date.parse(str(f, "validTo")), reason: str(f, "reason"),
    }));
    revalidatePath("/admin");
    return { ok: "代理を設定しました" };
  } catch (e) {
    return fail(e);
  }
}

export async function retireAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    const a = await requireAdmin();
    const retiredOn = date.parse(str(f, "retiredOn"));
    const m = await tx(a.memberId, (q) => members.retireMember(q, str(f, "memberId"), retiredOn));
    let note = "";
    if (f.get("banAuth") === "on" && m.auth_uid) {
      const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
      if (retiredOn < today) {
        const { banAuthUser } = await import("@/lib/legacy");
        await banAuthUser(m.auth_uid);
        note = "。メールアドレスのログイン（予約管理を含む）も停止しました";
      } else {
        note = "。メールアドレスのログイン停止は、退職日の翌日以降にもう一度この操作をしてください";
      }
    }
    revalidatePath("/admin");
    return { ok: `${m.name} さんの退職日を ${retiredOn} にしました${note}` };
  } catch (e) {
    return fail(e);
  }
}
