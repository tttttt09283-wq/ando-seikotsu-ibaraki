import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";
import { PageHeader } from "@/components/page";
import { getOrgContext, storeIdsWith } from "@/lib/auth/context";
import { createClient } from "@/lib/db/server";
import { listStaff } from "@/lib/org-data";

export const metadata = { title: "顧客登録" };

export default async function NewCustomerPage({ params }: PageProps<"/o/[orgSlug]/customers/new">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  const supabase = await createClient();
  const storeIds = storeIdsWith(ctx, "customer.write");
  const staff = await listStaff(ctx, supabase);
  return (
    <>
      <PageHeader title="顧客登録" back={`/o/${orgSlug}/customers`} />
      <CustomerForm action={createCustomer} orgSlug={orgSlug} stores={ctx.stores.filter((s) => storeIds.includes(s.id))} staff={staff} />
    </>
  );
}
