// ルール・マニュアル：一覧、詳細、提案、編集、改訂、承認の流れ、確認済み、検索、原文の取り込み
import type postgres from "postgres";
import {
  type Actor, type ReviewAction, type VersionInfo, TRANSITIONS, canAck, canDo, canEditVersion, canPropose, canRevise,
  canViewVersion, gmReviewAuthority, isTargeted, isTop,
} from "../authz";
import { categoryPrefix, OPEN_STATUSES, type Category, type Importance, type Kind, type Position, type Status } from "../config";
import { SECTIONS, SOURCE } from "../import-config";
import type { ParseResult } from "../importer";
import { RuleError } from "./members";

type Q = postgres.Sql | postgres.TransactionSql;
const no = (m: string): never => { throw new RuleError(m); };

export type VersionRow = {
  id: string;
  doc_id: string;
  version_no: number;
  status: Status;
  title: string;
  body: string;
  original_text: string | null;
  category: Category;
  importance: Importance;
  target_positions: string[];
  target_clinics: string[];
  effective_on: string | null;
  change_summary: string;
  requires_reack: boolean;
  published_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};
export type DocRow = {
  id: string;
  code: string;
  kind: Kind;
  source: "google_doc" | "proposal";
  source_ref: string | null;
  import_note: string;
  current_version_id: string | null;
  created_by: string | null;
};
export type DocSummary = DocRow & { current: VersionRow | null; latest: VersionRow; acked: boolean; needsAck: boolean };

export const info = (d: Pick<DocRow, "kind">, v: VersionRow): VersionInfo => ({
  status: v.status, kind: d.kind, createdBy: v.created_by, targetPositions: v.target_positions, targetClinics: v.target_clinics,
});

const VERSION_COLS = (q: Q) => q`v.id, v.doc_id, v.version_no, v.status, v.title, v.body, v.original_text, v.category, v.importance,
  v.target_positions, v.target_clinics, v.effective_on::text, v.change_summary, v.requires_reack, v.published_at, v.created_by, v.created_at, v.updated_at`;

// 見られる項目の一覧。公開中の版（current）と、最新の版（latest：未公開の改訂を含む）を返す
export async function listDocs(q: Q, actor: Actor, opts: { kinds?: Kind[] } = {}): Promise<DocSummary[]> {
  const docs = await q<DocRow[]>`select * from mn_docs ${opts.kinds?.length ? q`where kind in ${q(opts.kinds)}` : q``} order by code`;
  if (!docs.length) return [];
  const versions = await q<VersionRow[]>`select ${VERSION_COLS(q)} from mn_doc_versions v where v.doc_id in ${q(docs.map((d) => d.id))} order by v.version_no`;
  const acks = new Set(
    (await q<{ version_id: string }[]>`select version_id from mn_doc_acks where member_id = ${actor.memberId}`).map((r) => r.version_id),
  );
  const out: DocSummary[] = [];
  for (const d of docs) {
    const vs = versions.filter((v) => v.doc_id === d.id);
    if (!vs.length) continue;
    const current = vs.find((v) => v.id === d.current_version_id) ?? null;
    const latest = vs[vs.length - 1];
    const visibleCurrent = current && canViewVersion(actor, info(d, current)) ? current : null;
    const visibleLatest = canViewVersion(actor, info(d, latest)) ? latest : visibleCurrent;
    if (!visibleLatest) continue;
    const needsAck = !!visibleCurrent && canAck(actor, info(d, visibleCurrent));
    out.push({ ...d, current: visibleCurrent, latest: visibleLatest, acked: !!visibleCurrent && acks.has(visibleCurrent.id), needsAck });
  }
  return out;
}

export type DocDetail = {
  doc: DocRow;
  versions: VersionRow[]; // 見られる版だけ
  reviews: { id: string; version_id: string; action: ReviewAction; from_status: string; to_status: string; actor_name: string | null;
    via_name: string | null; comment: string; external_reviewer: string | null; external_checked_on: string | null; created_at: Date }[];
  conflicts: { id: string; version_id: string; conflicts_with_code: string; conflicts_with_title: string; note: string; status: string; resolution: string | null }[];
  links: { relation: string; code: string | null; title: string | null; form_type: string | null }[];
  ackedVersionIds: string[];
  ackCount: Record<string, number>;
  sourceText: string | null; // 取り込んだ原文の項目全体（ルールのときは取り出し元）
};

export async function getDocDetail(q: Q, actor: Actor, code: string): Promise<DocDetail | null> {
  const [doc] = await q<DocRow[]>`select * from mn_docs where code = ${code}`;
  if (!doc) return null;
  const all = await q<VersionRow[]>`select ${VERSION_COLS(q)} from mn_doc_versions v where v.doc_id = ${doc.id} order by v.version_no desc`;
  const versions = all.filter((v) => canViewVersion(actor, info(doc, v)));
  if (!versions.length) return null;
  const ids = versions.map((v) => v.id);
  const reviews = await q<DocDetail["reviews"]>`
    select r.id, r.version_id, r.action, r.from_status, r.to_status, a.name as actor_name, d.name as via_name, r.comment,
           r.external_reviewer, r.external_checked_on::text, r.created_at
    from mn_doc_reviews r left join mn_members a on a.id = r.actor_id left join mn_members d on d.id = r.via_delegation_of
    where r.version_id in ${q(ids)} order by r.created_at desc`;
  const conflicts = await q<DocDetail["conflicts"]>`
    select c.id, c.version_id, d.code as conflicts_with_code, coalesce(cv.title, lv.title) as conflicts_with_title, c.note, c.status, c.resolution
    from mn_doc_conflicts c join mn_docs d on d.id = c.conflicts_with
    left join mn_doc_versions cv on cv.id = d.current_version_id
    left join lateral (select title from mn_doc_versions where doc_id = d.id order by version_no desc limit 1) lv on true
    where c.version_id in ${q(ids)} order by c.created_at desc`;
  const links = await q<DocDetail["links"]>`
    select l.relation, d.code, coalesce(cv.title, lv.title) as title, l.form_type
    from mn_doc_links l left join mn_docs d on d.id = l.to_doc
    left join mn_doc_versions cv on cv.id = d.current_version_id
    left join lateral (select title from mn_doc_versions where doc_id = d.id order by version_no desc limit 1) lv on true
    where l.from_doc = ${doc.id}`;
  const acked = await q<{ version_id: string }[]>`select version_id from mn_doc_acks where member_id = ${actor.memberId} and version_id in ${q(ids)}`;
  const counts = isTop(actor)
    ? await q<{ version_id: string; n: number }[]>`select version_id, count(*)::int as n from mn_doc_acks where version_id in ${q(ids)} group by version_id`
    : [];
  let sourceText: string | null = null;
  if (doc.source_ref) {
    const [s] = await q<{ text: string }[]>`
      select s.text from mn_source_sections s join mn_source_imports i on i.id = s.import_id
      where s.ref = ${doc.source_ref} order by i.imported_at desc limit 1`;
    sourceText = s?.text ?? null;
  }
  return {
    doc, versions, reviews, conflicts, links,
    ackedVersionIds: acked.map((a) => a.version_id),
    ackCount: Object.fromEntries(counts.map((c) => [c.version_id, c.n])),
    sourceText,
  };
}

// ===== 提案・編集・改訂 =====
export type VersionInput = {
  title: string;
  body: string;
  category: Category;
  importance: Importance;
  targetPositions: Position[];
  targetClinics: string[];
  effectiveOn: string | null;
  changeSummary: string;
  requiresReack: boolean;
};

async function nextCode(q: Q, kind: Kind, category: Category): Promise<string> {
  const prefix = kind === "rule" ? `RULE-${categoryPrefix(category)}-` : kind === "staff_manual" ? "MAN-P" : kind === "training" ? "EDU-P" : "MGR-P";
  const rows = await q<{ code: string }[]>`select code from mn_docs where code like ${prefix + "%"}`;
  const n = Math.max(0, ...rows.map((r) => Number(r.code.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}

export async function createProposal(
  q: Q,
  actor: Actor,
  kind: Kind,
  input: VersionInput,
  conflict: { docCode: string; note: string } | null,
): Promise<string> {
  if (!canPropose(actor)) no("提案できるのは院長・BM・GM・社長です（メールアドレスでログインしてください）");
  if (kind === "manager_manual" && !isTop(actor)) no("院長マニュアルの追加は GM・社長が行います");
  const code = await nextCode(q, kind, input.category);
  const [doc] = await q<DocRow[]>`insert into mn_docs (code, kind, source, created_by) values (${code}, ${kind}, 'proposal', ${actor.memberId}) returning *`;
  const [v] = await q<VersionRow[]>`
    insert into mn_doc_versions (doc_id, version_no, status, title, body, category, importance, target_positions, target_clinics, effective_on, change_summary, requires_reack, created_by)
    values (${doc.id}, 1, 'draft', ${input.title}, ${input.body}, ${input.category}, ${input.importance}, ${input.targetPositions}, ${input.targetClinics},
            ${input.effectiveOn}, ${input.changeSummary}, ${input.requiresReack}, ${actor.memberId}) returning *`;
  if (conflict) await addConflict(q, actor, v.id, conflict.docCode, conflict.note);
  return code;
}

export async function addConflict(q: Q, actor: Actor, versionId: string, docCode: string, note: string) {
  const [d] = await q<{ id: string; doc_id: string }[]>`select d.id, v.doc_id from mn_docs d, mn_doc_versions v where d.code = ${docCode} and v.id = ${versionId}`;
  if (!d) no(`矛盾する項目（${docCode}）が見つかりません`);
  if (d.id === d.doc_id) no("同じ項目は指定できません");
  if (!note.trim()) no("矛盾の内容を書いてください");
  await q`insert into mn_doc_conflicts (version_id, conflicts_with, note, created_by) values (${versionId}, ${d.id}, ${note}, ${actor.memberId})`;
}

export async function resolveConflict(q: Q, actor: Actor, conflictId: string, resolution: string) {
  if (!isTop(actor)) no("矛盾の解決は GM・社長が行います");
  if (!resolution.trim()) no("どう解決したかを書いてください");
  const r = await q`update mn_doc_conflicts set status = 'resolved', resolution = ${resolution}, resolved_by = ${actor.memberId}, resolved_at = now()
                    where id = ${conflictId} and status = 'open'`;
  if (!r.count) no("未解決の矛盾が見つかりません");
}

async function loadVersion(q: Q, versionId: string) {
  const [v] = await q<(VersionRow & { kind: Kind; code: string })[]>`
    select ${VERSION_COLS(q)}, d.kind, d.code from mn_doc_versions v join mn_docs d on d.id = v.doc_id where v.id = ${versionId} for update of v`;
  if (!v) no("版が見つかりません");
  return v;
}

export async function updateVersion(q: Q, actor: Actor, versionId: string, input: VersionInput) {
  const v = await loadVersion(q, versionId);
  if (!canEditVersion(actor, info(v, v))) no("この版は編集できません（下書き・差し戻しのときだけ編集できます）");
  await q`update mn_doc_versions set title = ${input.title}, body = ${input.body}, category = ${input.category}, importance = ${input.importance},
    target_positions = ${input.targetPositions}, target_clinics = ${input.targetClinics}, effective_on = ${input.effectiveOn},
    change_summary = ${input.changeSummary}, requires_reack = ${input.requiresReack} where id = ${versionId}`;
  return v.code;
}

// 改訂：公開中（または最新）の版を写して新しい下書きを作る。原文は写さない（最初の版に残る）
export async function createRevision(q: Q, actor: Actor, code: string): Promise<string> {
  if (!canRevise(actor)) no("改訂は GM・社長が行います");
  const [doc] = await q<DocRow[]>`select * from mn_docs where code = ${code} for update`;
  if (!doc) no("項目が見つかりません");
  const [open] = await q`select 1 from mn_doc_versions where doc_id = ${doc.id} and status in ${q([...OPEN_STATUSES])}`;
  if (open) no("まだ公開されていない版があります。その版を先に進めるか、差し戻してから編集してください");
  const [base] = await q<VersionRow[]>`select ${VERSION_COLS(q)} from mn_doc_versions v where v.doc_id = ${doc.id} order by v.version_no desc limit 1`;
  const [v] = await q<{ id: string }[]>`
    insert into mn_doc_versions (doc_id, version_no, status, title, body, category, importance, target_positions, target_clinics, effective_on, change_summary, requires_reack, created_by)
    values (${doc.id}, ${base.version_no + 1}, 'draft', ${base.title}, ${base.body}, ${base.category}, ${base.importance}, ${base.target_positions},
            ${base.target_clinics}, null, '', true, ${actor.memberId}) returning id`;
  return v.id;
}

// ===== 承認の流れ =====
export async function review(
  q: Q,
  actor: Actor,
  versionId: string,
  action: ReviewAction,
  opts: { comment?: string; externalReviewer?: string; externalCheckedOn?: string } = {},
) {
  const v = await loadVersion(q, versionId);
  if (!canDo(actor, action, info(v, v))) no("この操作をする権限がないか、今の状態ではできません");
  const comment = (opts.comment || "").trim();
  if ((action === "return" || action === "legal_hold") && !comment) no("理由を書いてください");
  if (action === "legal_clear" && (!opts.externalReviewer?.trim() || !opts.externalCheckedOn)) no("確認した社労士の名前と確認日を入れてください");
  if (action === "president_approve") {
    const [c] = await q`select 1 from mn_doc_conflicts where version_id = ${versionId} and status = 'open'`;
    if (c) no("既存ルールとの矛盾が解決されていないため公開できません");
    if (!v.effective_on) await q`update mn_doc_versions set effective_on = mn_today() where id = ${versionId}`;
  }
  const to = TRANSITIONS[action].to;
  const via = action === "gm_approve" || (action === "return" && v.status === "gm_review") ? gmReviewAuthority(actor).viaDelegationOf : null;
  if (to === "published") {
    // 前の公開版は「旧版」に
    await q`update mn_doc_versions set status = 'superseded' where doc_id = ${v.doc_id} and status = 'published'`;
  }
  await q`update mn_doc_versions set status = ${to} where id = ${versionId}`;
  if (to === "published") await q`update mn_docs set current_version_id = ${versionId} where id = ${v.doc_id}`;
  if (to === "archived") await q`update mn_docs set current_version_id = null where id = ${v.doc_id}`;
  await q`insert into mn_doc_reviews (version_id, action, from_status, to_status, actor_id, via_delegation_of, comment, external_reviewer, external_checked_on)
          values (${versionId}, ${action}, ${v.status}, ${to}, ${actor.memberId}, ${via}, ${comment},
                  ${opts.externalReviewer?.trim() || null}, ${opts.externalCheckedOn || null})`;
  await notifyAfterReview(q, v, to);
  return v.code;
}

// 通知：GM確認待ち→GM、社長承認待ち→社長、差し戻し→作った人、公開→対象スタッフ全員（再確認が必要なとき）
async function notifyAfterReview(q: Q, v: VersionRow & { kind: Kind; code: string }, to: Status) {
  const link = `/docs/${v.code}`;
  const byPosition = async (pos: Position) =>
    (await q<{ member_id: string }[]>`select distinct a.member_id from mn_assignments a join mn_members m on m.id = a.member_id
      where a.position = ${pos} and m.is_active and a.valid_from <= mn_today() and (a.valid_to is null or a.valid_to >= mn_today())`).map((r) => r.member_id);
  let targets: string[] = [];
  let title = "";
  let kind = "";
  if (to === "gm_review") {
    const delegates = (await q<{ to_member: string }[]>`select to_member from mn_delegations where permission = 'gm_review' and valid_from <= mn_today() and valid_to >= mn_today()`).map((r) => r.to_member);
    targets = [...(await byPosition("gm")), ...delegates];
    title = `GM確認待ち：${v.title}`; kind = "review";
  } else if (to === "president_approval") {
    targets = await byPosition("president");
    title = `社長承認待ち：${v.title}`; kind = "review";
  } else if (to === "returned" && v.created_by) {
    targets = [v.created_by];
    title = `差し戻し：${v.title}`; kind = "returned";
  } else if (to === "published") {
    const prevPublished = v.version_no > 1;
    if (prevPublished && !v.requires_reack) return;
    targets = await targetedMembers(q, v);
    title = prevPublished ? `ルールが改訂されました（再確認してください）：${v.title}` : `新しく公開されました：${v.title}`;
    kind = "ack";
  }
  const uniq = [...new Set(targets)];
  if (!uniq.length) return;
  await q`insert into mn_notifications ${q(uniq.map((m) => ({ member_id: m, kind, title, link })))}`;
}

async function targetedMembers(q: Q, v: Pick<VersionRow, "target_positions" | "target_clinics">): Promise<string[]> {
  const rows = await q<{ member_id: string; clinic_id: string | null; position: Position; is_primary: boolean }[]>`
    select a.member_id, a.clinic_id, a.position, a.is_primary from mn_assignments a join mn_members m on m.id = a.member_id
    where m.is_active and a.valid_from <= mn_today() and (a.valid_to is null or a.valid_to >= mn_today())`;
  const byMember = new Map<string, Actor>();
  for (const r of rows) {
    const a = byMember.get(r.member_id) ?? { memberId: r.member_id, name: "", via: "email" as const, isSystemAdmin: false, assignments: [], areaClinics: [], gmDelegations: [] };
    a.assignments.push({ clinicId: r.clinic_id, position: r.position, isPrimary: r.is_primary });
    byMember.set(r.member_id, a);
  }
  return [...byMember.values()].filter((a) => isTargeted(a, { targetPositions: v.target_positions, targetClinics: v.target_clinics })).map((a) => a.memberId);
}

export async function ackVersion(q: Q, actor: Actor, versionId: string) {
  const v = await loadVersion(q, versionId);
  if (!canAck(actor, info(v, v))) no("この版は確認の対象ではありません");
  await q`insert into mn_doc_acks (version_id, member_id) values (${versionId}, ${actor.memberId}) on conflict do nothing`;
  await q`update mn_notifications set read_at = now() where member_id = ${actor.memberId} and link = ${"/docs/" + v.code} and read_at is null`;
  return v.code;
}

// ===== 検索 =====
export type SearchHit = { code: string; kind: Kind; title: string; status: Status; category: Category; snippet: string; effective_on: string | null; updated_at: Date };

export async function searchDocs(q: Q, actor: Actor, text: string, includeDrafts: boolean): Promise<{ terms: string[]; hits: SearchHit[] }> {
  const query = text.trim().slice(0, 100);
  if (!query) return { terms: [], hits: [] };
  const [{ terms }] = await q<{ terms: string[] }[]>`select mn_search_terms(${query}) as terms`;
  const patterns = terms.map((t) => `%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
  const drafts = includeDrafts && isTop(actor);
  const rows = await q<(VersionRow & { code: string; kind: Kind })[]>`
    select ${VERSION_COLS(q)}, d.code, d.kind from mn_docs d
    join mn_doc_versions v on ${drafts ? q`v.id = coalesce((select id from mn_doc_versions x where x.doc_id = d.id order by version_no desc limit 1), d.current_version_id)` : q`v.id = d.current_version_id`}
    where (v.title ilike any(${patterns}) or v.body ilike any(${patterns}))`;
  const visible = rows.filter((v) => canViewVersion(actor, info(v, v)));
  const score = (v: VersionRow) => terms.reduce((s, t) => s + (v.title.includes(t) ? 10 : 0) + (v.body.split(t).length - 1), 0);
  visible.sort((a, b) => score(b) - score(a) || a.code.localeCompare(b.code));
  return {
    terms,
    hits: visible.slice(0, 50).map((v) => ({
      code: v.code, kind: v.kind, title: v.title, status: v.status, category: v.category, effective_on: v.effective_on, updated_at: v.updated_at,
      snippet: snippetOf(v.body, terms),
    })),
  };
}

export function snippetOf(body: string, terms: string[], width = 60): string {
  const i = Math.min(...terms.map((t) => body.indexOf(t)).filter((x) => x >= 0), Number.MAX_SAFE_INTEGER);
  if (i === Number.MAX_SAFE_INTEGER) return body.slice(0, width * 2);
  const start = Math.max(0, i - width);
  return (start > 0 ? "…" : "") + body.slice(start, i + width).replace(/\n+/g, " ") + (i + width < body.length ? "…" : "");
}

// ===== 承認待ちの一覧 =====
export async function reviewQueue(q: Q, actor: Actor) {
  const docs = await listDocs(q, actor);
  const open = docs.filter((d) => d.latest && OPEN_STATUSES.includes(d.latest.status) && d.latest.id !== d.current_version_id);
  return {
    gm: open.filter((d) => d.latest.status === "gm_review"),
    president: open.filter((d) => d.latest.status === "president_approval"),
    legal: open.filter((d) => d.latest.status === "legal_hold"),
    drafts: open.filter((d) => d.latest.status === "draft" || d.latest.status === "returned"),
  };
}

// ===== 原文の取り込み =====
// 何度取り込んでも、すでにある項目は上書きしない（原文が変わっていたら知らせるだけ）
export async function importManual(q: Q, actor: Actor, parsed: ParseResult) {
  const [imp] = await q<{ id: string }[]>`insert into mn_source_imports (source_name, source_id, sha256, imported_by)
    values (${SOURCE.name}, ${SOURCE.id}, ${parsed.sha256}, ${actor.memberId}) returning id`;
  await q`insert into mn_source_sections ${q(parsed.sections.map((s) => ({ import_id: imp.id, ref: s.ref, heading: s.heading, text: s.text })))}`;
  const created: string[] = [];
  const changed: string[] = [];
  const sectionDocId = new Map<string, string>();
  for (const s of parsed.sections) {
    const cfg = SECTIONS.find((c) => c.ref === s.ref)!;
    const code = `${cfg.kind === "training" ? "EDU" : "MAN"}-${s.ref}`;
    const [existing] = await q<{ id: string; original_text: string | null }[]>`
      select d.id, v.original_text from mn_docs d join mn_doc_versions v on v.doc_id = d.id and v.version_no = 1 where d.code = ${code}`;
    if (existing) {
      sectionDocId.set(s.ref, existing.id);
      if (existing.original_text !== s.text) changed.push(`${code} ${s.heading}`);
      continue;
    }
    const id = await insertImported(q, actor, {
      code, kind: cfg.kind, ref: s.ref, note: cfg.note ?? "", title: s.heading, text: s.text, category: cfg.category,
      importance: cfg.importance, status: cfg.status, targets: cfg.targets ?? [],
    });
    sectionDocId.set(s.ref, id);
    created.push(code);
  }
  for (const r of parsed.rules) {
    if (!r.text || r.missing.length) continue;
    const [existing] = await q<{ id: string; original_text: string | null }[]>`
      select d.id, v.original_text from mn_docs d join mn_doc_versions v on v.doc_id = d.id and v.version_no = 1 where d.code = ${r.code}`;
    if (existing) {
      if (existing.original_text !== r.text) changed.push(`${r.code} ${r.title}`);
      continue;
    }
    const id = await insertImported(q, actor, {
      code: r.code, kind: "rule", ref: r.ref, note: r.note ?? "", title: r.title, text: r.text, category: r.category,
      importance: r.importance, status: "gm_review", targets: [],
    });
    const from = sectionDocId.get(r.ref);
    if (from) {
      await q`insert into mn_doc_links (from_doc, to_doc, relation) values (${id}, ${from}, 'source_section') on conflict do nothing`;
      await q`insert into mn_doc_links (from_doc, to_doc, relation) values (${from}, ${id}, 'related_rule') on conflict do nothing`;
    }
    created.push(r.code);
  }
  return { importId: imp.id, created, changed };
}

async function insertImported(
  q: Q,
  actor: Actor,
  x: { code: string; kind: Kind; ref: string; note: string; title: string; text: string; category: Category; importance: Importance;
    status: "draft" | "legal_hold" | "gm_review"; targets: Position[] },
): Promise<string> {
  const [doc] = await q<{ id: string }[]>`insert into mn_docs (code, kind, source, source_ref, import_note, created_by)
    values (${x.code}, ${x.kind}, 'google_doc', ${x.ref}, ${x.note}, ${actor.memberId}) returning id`;
  const [v] = await q<{ id: string }[]>`
    insert into mn_doc_versions (doc_id, version_no, status, title, body, original_text, category, importance, target_positions, change_summary, created_by)
    values (${doc.id}, 1, 'draft', ${x.title}, ${x.text}, ${x.text}, ${x.category}, ${x.importance}, ${x.targets}, '原文の取り込み', ${actor.memberId}) returning id`;
  if (x.status !== "draft") {
    await q`update mn_doc_versions set status = ${x.status} where id = ${v.id}`;
    await q`insert into mn_doc_reviews (version_id, action, from_status, to_status, actor_id, comment)
            values (${v.id}, ${x.status === "legal_hold" ? "legal_hold" : "submit"}, 'draft', ${x.status}, ${actor.memberId},
                    ${x.note || "原文の取り込み（確定候補）"})`;
  }
  return doc.id;
}
