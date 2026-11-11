import { ImportForm } from "./import-form";
import { PageHeader } from "@/components/page";
import { getOrgContext, requirePermission, storeIdsWith } from "@/lib/auth/context";

export const metadata = { title: "CSV取込" };

export default async function ImportPage({ params }: PageProps<"/o/[orgSlug]/customers/import">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "customer.import");
  const ids = storeIdsWith(ctx, "customer.import");
  return (
    <>
      <PageHeader title="CSV取込" back={`/o/${orgSlug}/customers`} />
      <ImportForm orgSlug={orgSlug} stores={ctx.stores.filter((s) => ids.includes(s.id))} />
      <section className="mt-6 grid gap-2 text-sm">
        <h2 className="font-bold">CSV の形式（1行目は見出し）</h2>
        <p>
          <strong>顧客：</strong>姓（必須）, 名, セイ, メイ, 電話番号, メールアドレス, 顧客番号, 店舗コード, 担当者メール, 連絡同意（同意／不可／配信停止）
        </p>
        <p>
          <strong>来店履歴：</strong>顧客番号（必須）, 来店日（必須・例 2026-11-01）, 店舗コード, メニュー
        </p>
        <p>
          <strong>予約：</strong>顧客番号（必須）, 予約日時（必須・例 2026-11-20 10:30）, 店舗コード, ステータス（予約済／確定／キャンセル）
        </p>
        <p className="text-muted-foreground">
          同じ顧客番号の顧客は上書き更新します。症状などの医療情報の列は取り込みません。実在の顧客データの取込は、試験運用の承認後に行ってください。
        </p>
      </section>
    </>
  );
}
