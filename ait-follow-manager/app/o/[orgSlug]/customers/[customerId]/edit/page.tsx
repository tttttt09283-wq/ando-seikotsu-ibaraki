import { notFound } from "next/navigation";
import { updateCustomer } from "../../actions";
import { CustomerForm } from "../../customer-form";
import { PageHeader } from "@/components/page";
import { getOrgContext, storeIdsWith } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { listStaff } from "@/lib/org-data";

export const metadata = { title: "顧客編集" };

export default async function EditCustomerPage({ params }: PageProps<"/o/[orgSlug]/customers/[customerId]/edit">) {
  const { orgSlug, customerId } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (!/^[0-9a-f-]{36}$/.test(customerId)) notFound();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, store_id, customer_code, family_name, given_name, family_name_kana, given_name_kana, phone, email, assigned_staff_id")
    .eq("id", customerId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!customer) notFound();
  const storeIds = storeIdsWith(ctx, "customer.write");
  const staff = await listStaff(ctx, supabase);
  return (
    <>
      <PageHeader title="顧客情報の編集" back={`/o/${orgSlug}/customers/${customerId}`} />
      <CustomerForm
        action={updateCustomer}
        orgSlug={orgSlug}
        stores={ctx.stores.filter((s) => storeIds.includes(s.id))}
        staff={staff}
        customer={customer}
      />
    </>
  );
}
