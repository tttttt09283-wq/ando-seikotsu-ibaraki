import { renderTemplate } from "@/lib/templates";

export function customerName(c: { family_name: string; given_name: string }) {
  return `${c.family_name} ${c.given_name}`.trim();
}

/** テンプレートの差し込み値。値が無いものは「（未設定）」として、送信前に気付けるようにする */
export function renderForCustomer(
  body: string,
  v: { customer: { family_name: string; given_name: string }; storeName?: string; staffName?: string; nextAppointmentAt?: string | null; timeZone: string },
) {
  const nextAppt = v.nextAppointmentAt
    ? new Intl.DateTimeFormat("ja-JP", { timeZone: v.timeZone, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(
        new Date(v.nextAppointmentAt),
      )
    : "（次回予約未確認）";
  return renderTemplate(body, {
    顧客名: customerName(v.customer),
    店舗名: v.storeName ?? "（店舗名）",
    担当者名: v.staffName ?? "（担当者名）",
    次回予約日: nextAppt,
  });
}
