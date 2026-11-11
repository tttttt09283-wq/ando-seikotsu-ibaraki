import Link from "next/link";
import { ChevronRight, Plus, SlidersHorizontal, Upload } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page";
import { AppointmentText, ContactStatusBadge, type ContactStatus } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ctxCan, getOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { addDays, formatJpDate, todayInTimeZone } from "@/lib/dates";
import { listStaff, listTags, storeName } from "@/lib/org-data";

export const metadata = { title: "顧客一覧" };

const PAGE_SIZE = 50;

export default async function CustomersPage({ params, searchParams }: PageProps<"/o/[orgSlug]/customers">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  const ctx = await getOrgContext(orgSlug);
  const supabase = await createClient();
  const today = todayInTimeZone(ctx.org.timezone);

  const f = {
    q: one("q").slice(0, 50),
    store: ctx.accessibleStoreIds.includes(one("store")) ? one("store") : "",
    staff: /^[0-9a-f-]{36}$/.test(one("staff")) ? one("staff") : "",
    tag: /^[0-9a-f-]{36}$/.test(one("tag")) ? one("tag") : "",
    follow: ["overdue", "open", "none"].includes(one("follow")) ? one("follow") : "",
    contact: ["unknown", "allowed", "blocked"].includes(one("contact")) ? one("contact") : "",
    appt: ["unconfirmed", "has"].includes(one("appt")) ? one("appt") : "",
    lapsed: ["30", "60", "90", "180"].includes(one("lapsed")) ? one("lapsed") : "",
    page: Math.max(1, Math.min(1000, Number(one("page")) || 1)),
  };

  let q = supabase.from("customer_overview").select("*", { count: "exact" }).eq("organization_id", ctx.org.id);
  if (f.q) {
    // ILIKE のワイルドカードをエスケープし、ハイフン等を除いた電話番号でも検索可能にする
    const term = f.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`).replace(/\s+/g, "");
    q = q.ilike("search_text", `%${term}%`);
  }
  if (f.store) q = q.eq("store_id", f.store);
  if (f.staff) q = q.eq("assigned_staff_id", f.staff);
  if (f.tag) q = q.contains("tag_ids", [f.tag]);
  if (f.follow === "overdue") q = q.gt("overdue_task_count", 0);
  if (f.follow === "open") q = q.gt("open_task_count", 0);
  if (f.follow === "none") q = q.eq("open_task_count", 0);
  if (f.contact === "unknown") q = q.eq("contact_status", "unknown");
  if (f.contact === "allowed") q = q.eq("contact_status", "allowed");
  if (f.contact === "blocked") q = q.in("contact_status", ["not_allowed", "unsubscribed"]);
  if (f.appt === "unconfirmed") q = q.is("next_appointment_at", null);
  if (f.appt === "has") q = q.not("next_appointment_at", "is", null);
  if (f.lapsed) q = q.lte("last_visit_on", addDays(today, -Number(f.lapsed)));

  const from = (f.page - 1) * PAGE_SIZE;
  const [{ data: customers, count }, staff, tags] = await Promise.all([
    q.order("last_visit_on", { ascending: false, nullsFirst: false }).order("customer_code").range(from, from + PAGE_SIZE - 1),
    listStaff(ctx, supabase),
    listTags(ctx, supabase),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const activeFilters = Object.entries(f).filter(([k, v]) => k !== "q" && k !== "page" && v).length;
  const total = count ?? 0;
  const pageHref = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...f, page: String(p) }).filter(([, v]) => v && v !== "1") as [string, string][]);
    return `/o/${orgSlug}/customers?${u}`;
  };

  return (
    <>
      <PageHeader
        title="顧客一覧"
        actions={
          <>
            {ctxCan(ctx, "customer.import") && (
              <Link href={`/o/${orgSlug}/customers/import`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Upload /> CSV
              </Link>
            )}
            <Link href={`/o/${orgSlug}/customers/new`} className={buttonVariants({ size: "sm" })}>
              <Plus /> 登録
            </Link>
          </>
        }
      />
      {one("deleted") && <p className="mb-3 rounded-md bg-success-soft px-3 py-2 text-sm text-success">顧客の個人情報を削除しました。</p>}

      <form action={`/o/${orgSlug}/customers`} className="mb-3 grid gap-2">
        <div className="flex gap-2">
          <Input name="q" type="search" defaultValue={f.q} placeholder="氏名・かな・顧客番号・電話番号" aria-label="顧客を検索" />
          <Button type="submit">検索</Button>
        </div>
        <details className="rounded-lg border bg-card" open={activeFilters > 0}>
          <summary className="flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-semibold">
            <SlidersHorizontal className="size-4" aria-hidden />
            絞り込み{activeFilters > 0 && <Badge>{activeFilters}</Badge>}
          </summary>
          <div className="grid grid-cols-2 gap-2 p-3 pt-0 sm:grid-cols-3">
            {ctx.accessibleStoreIds.length > 1 && (
              <Select name="store" defaultValue={f.store} aria-label="店舗">
                <option value="">すべての店舗</option>
                {ctx.stores
                  .filter((s) => ctx.accessibleStoreIds.includes(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            )}
            <Select name="staff" defaultValue={f.staff} aria-label="担当スタッフ">
              <option value="">担当：すべて</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="follow" defaultValue={f.follow} aria-label="フォロー状況">
              <option value="">フォロー：すべて</option>
              <option value="overdue">期限切れあり</option>
              <option value="open">未対応あり</option>
              <option value="none">未対応なし</option>
            </Select>
            <Select name="contact" defaultValue={f.contact} aria-label="連絡可否">
              <option value="">連絡可否：すべて</option>
              <option value="allowed">連絡可</option>
              <option value="unknown">同意未確認</option>
              <option value="blocked">連絡不可・配信停止</option>
            </Select>
            <Select name="appt" defaultValue={f.appt} aria-label="予約状況">
              <option value="">予約：すべて</option>
              <option value="unconfirmed">予約未確認</option>
              <option value="has">予約あり</option>
            </Select>
            <Select name="lapsed" defaultValue={f.lapsed} aria-label="最終来店からの日数">
              <option value="">最終来店：すべて</option>
              {["30", "60", "90", "180"].map((d) => (
                <option key={d} value={d}>
                  {d}日以上前
                </option>
              ))}
            </Select>
            {tags.length > 0 && (
              <Select name="tag" defaultValue={f.tag} aria-label="タグ">
                <option value="">タグ：すべて</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
            <div className="col-span-full flex gap-2">
              <Button type="submit" className="flex-1">
                適用
              </Button>
              <Link href={`/o/${orgSlug}/customers`} className={buttonVariants({ variant: "ghost" })}>
                クリア
              </Link>
            </div>
          </div>
        </details>
      </form>

      <p className="mb-2 text-sm text-muted-foreground">{total} 名</p>
      {customers?.length ? (
        <ul className="grid gap-2">
          {customers.map((c) => (
            <li key={c.id}>
              <Link href={`/o/${orgSlug}/customers/${c.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">
                      {c.family_name} {c.given_name}
                    </span>
                    <span className="text-xs text-muted-foreground">#{c.customer_code}</span>
                    {c.contact_status !== "allowed" && <ContactStatusBadge status={c.contact_status as ContactStatus} />}
                    {(c.overdue_task_count ?? 0) > 0 ? (
                      <Badge variant="danger">期限切れ {c.overdue_task_count}</Badge>
                    ) : (c.open_task_count ?? 0) > 0 ? (
                      <Badge>未対応 {c.open_task_count}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground sm:grid-cols-4">
                    <span>{storeName(ctx, c.store_id)}</span>
                    <span>最終来店 {formatJpDate(c.last_visit_on)}</span>
                    <span>
                      次回予約 <AppointmentText nextAt={c.next_appointment_at} timeZone={ctx.org.timezone} />
                    </span>
                    <span>担当 {c.assigned_staff_id ? (staffName.get(c.assigned_staff_id) ?? "—") : "未設定"}</span>
                  </div>
                  {(c.tag_ids?.length ?? 0) > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.tag_ids!.map((id) => (
                        <Badge key={id} variant="outline">
                          {tagById.get(id)?.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>該当する顧客はいません。</EmptyState>
      )}
      {total > PAGE_SIZE && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="ページ">
          {f.page > 1 ? <Link href={pageHref(f.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>前へ</Link> : <span />}
          <span>
            {f.page} / {Math.ceil(total / PAGE_SIZE)}
          </span>
          {from + PAGE_SIZE < total ? <Link href={pageHref(f.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>次へ</Link> : <span />}
        </nav>
      )}
    </>
  );
}
