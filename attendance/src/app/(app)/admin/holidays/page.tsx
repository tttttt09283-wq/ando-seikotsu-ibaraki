import { requireHq } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ActionForm } from "@/components/ActionForm";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { todayJst } from "@/lib/time/jst";
import { addCompanyHoliday, setHolidayCreditTarget } from "./actions";

interface HolidayRow {
  holiday_date: string;
  name: string;
  holiday_kind: "national" | "company_designated";
  credit_target: boolean;
}

/** 会社カレンダー：祝日と、祝日勤務に伴う振休の付与対象日を管理する */
export default async function HolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireHq();
  const { year: yearParam } = await searchParams;
  const year = /^\d{4}$/.test(yearParam ?? "") ? Number(yearParam) : Number(todayJst().slice(0, 4));

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("company_holidays")
    .select("*")
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`)
    .order("holiday_date");
  const holidays = (data ?? []) as HolidayRow[];

  return (
    <>
      <PageHeader
        title="会社カレンダー"
        description="祝日が月にある場合、対象スタッフの振休が増えます（付与は本部の確認後。詳細はフェーズ4）。各院が祝日に診療するかは院ごとの診療時間で設定します。"
      />
      <Card className="mb-6">
        <div className="mb-4 flex gap-3 text-sm">
          {[year - 1, year, year + 1].map((y) => (
            <a key={y} href={`?year=${y}`} className={y === year ? "font-bold text-navy-900" : "text-brand-700 underline"}>
              {y}年
            </a>
          ))}
        </div>
        {holidays.length === 0 ? (
          <EmptyState>{year}年の祝日は未登録です</EmptyState>
        ) : (
          <Table head={["日付", "名称", "種別", "振休の対象", ""]}>
            {holidays.map((h) => (
              <tr key={h.holiday_date}>
                <Td>{h.holiday_date}</Td>
                <Td>{h.name}</Td>
                <Td>{h.holiday_kind === "national" ? "国民の祝日" : <Badge tone="blue">会社指定</Badge>}</Td>
                <Td>{h.credit_target ? <Badge tone="green">対象</Badge> : <Badge>対象外</Badge>}</Td>
                <Td>
                  <ActionForm action={setHolidayCreditTarget} submitLabel={h.credit_target ? "対象外にする" : "対象にする"} tone="secondary">
                    <input type="hidden" name="holiday_date" value={h.holiday_date} />
                    <input type="hidden" name="credit_target" value={h.credit_target ? "false" : "true"} />
                  </ActionForm>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="祝日・会社指定日を追加">
        <ActionForm action={addCompanyHoliday} submitLabel="追加" className="grid gap-4 sm:grid-cols-4">
          <Field label="日付">
            <Input name="holiday_date" type="date" required />
          </Field>
          <Field label="名称">
            <Input name="name" required />
          </Field>
          <Field label="種別">
            <Select name="holiday_kind" defaultValue="national">
              <option value="national">国民の祝日</option>
              <option value="company_designated">会社指定</option>
            </Select>
          </Field>
          <Field label="振休の対象">
            <label className="flex items-center gap-2 py-2">
              <input type="checkbox" name="credit_target" defaultChecked /> 対象にする
            </label>
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
