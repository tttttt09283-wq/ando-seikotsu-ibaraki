import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext, requirePermission } from "@/lib/auth/context";

export const metadata = { title: "データ管理" };

export default async function DataPage({ params }: PageProps<"/o/[orgSlug]/settings/data">) {
  const { orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  requirePermission(ctx, "customer.export", null);
  return (
    <>
      <PageHeader title="データ管理" back={`/o/${orgSlug}/more`} />
      <div className="grid gap-3">
        <Card>
          <CardHeader>
            <CardTitle>顧客データのエクスポート</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p className="text-muted-foreground">
              顧客の基本情報・最終来店日・連絡同意状態を CSV（Excel で開ける UTF-8）で出力します。出力操作は監査ログに記録されます。取り扱いにご注意ください。
            </p>
            <form method="post" action={`/api/o/${orgSlug}/export/customers`}>
              <Button type="submit" variant="outline">
                顧客 CSV をダウンロード
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>個人情報の削除・開示請求</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <p>削除：顧客詳細の「基本情報」タブ下部の「個人情報の削除」から行います（組織管理者のみ）。氏名・連絡先・メモ等を匿名化し、件数の集計のみ残します。</p>
            <p>開示：顧客詳細画面の内容、または上記の CSV で対応してください。</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
