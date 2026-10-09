import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { buttonStyles, Card, Footer } from "@/components/ui";

export const metadata: Metadata = { title: "プライバシーと利用目的｜あんど式 カラダ年齢チェック" };

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="space-y-5 px-5 py-8">
        <h1 className="text-2xl font-black">プライバシーと利用目的について</h1>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">取得しない情報</h2>
          <p>お名前・電話番号・メールアドレス・LINEのアカウント情報など、個人を特定できる情報は取得しません。ログインも不要です。</p>
        </Card>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">チェック結果の扱い</h2>
          <p>
            回答内容とスコアは、お使いのスマホのブラウザの中だけで計算・保存されます。途中で画面を閉じても再開できるよう、途中経過は24時間、結果は7日間だけブラウザ内に保存され、その後は自動的に破棄されます。
          </p>
        </Card>

        {siteConfig.statsEnabled && (
          <Card className="space-y-2 text-base leading-relaxed">
            <h2 className="text-lg font-black">匿名の利用統計（同意した方のみ）</h2>
            <p>
              チェック開始前に同意いただいた場合に限り、サービス改善を目的として、個人を特定できない形で次の情報を集計します：回答日時、年代、気になる症状、各チェックの結果、スコア、ランク、予約ボタンを押したかどうか。
            </p>
            <p>同意しない場合でも、すべてのチェックをご利用いただけます。</p>
          </Card>
        )}

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">チェック内容について</h2>
          <p>
            本チェックは医療診断ではありません。スコアとランクは独自の参考指標であり、疾病のリスクや健康状態を判定するものではありません。気になる症状がある場合は、医療機関や専門家にご相談ください。
          </p>
        </Card>

        <p className="text-sm text-slate-700">運営：{siteConfig.clinicName}</p>

        <Link href="/" className={buttonStyles.secondary}>
          トップページへ
        </Link>
      </div>
      <Footer />
    </main>
  );
}
