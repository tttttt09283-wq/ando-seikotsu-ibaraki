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
          <p>電話番号・メールアドレス・LINEのアカウント情報など、個人を特定できる情報は取得しません。ログインも不要です。お名前の入力は任意で、ニックネームでもかまいません。</p>
        </Card>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">チェック結果の扱い</h2>
          <p>
            回答内容とスコアは、お使いのスマホのブラウザの中で計算されます。途中で画面を閉じても再開できるよう、途中経過は24時間、結果は7日間だけブラウザ内に保存され、その後は自動的に破棄されます。
          </p>
        </Card>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">利用数の集計（匿名）</h2>
          <p>
            何人の方がチェックを始めたか・最後まで行ったかを数えるため、次の情報を当院に送ります：チェックの開始・完了の日時、どこから開いたか（LINE・QRコード・シェアなど）、入力したお名前（任意・ニックネーム可）、年齢、性別、気になる症状、チェックの結果（姿勢・体幹年齢・スコア・ランク）、予約ボタンを押したか・結果をシェアしたか、紹介コード。
          </p>
          <p>電話番号・メールアドレス・LINEのアカウント情報は送りません。集計した情報は当院のスタッフだけが見られ、サービスの改善・来院特典の確認・ご案内の参考にのみ使います。</p>
        </Card>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">結果をシェアした場合</h2>
          <p>
            シェアしたURLを開いた方には、あなたが入力したお名前（ニックネーム）と姿勢・体幹年齢だけが表示されます。ほかの回答内容は表示されません。シェアされた方は、当院のLINE公式アカウントを友だち追加してからチェックを始めます。
          </p>
        </Card>

        <Card className="space-y-2 text-base leading-relaxed">
          <h2 className="text-lg font-black">WEB予約をする場合</h2>
          <p>
            結果画面の予約ボタンから予約した場合に限り、今回のチェック結果の要約（カラダ年齢・スコア・ランク）が予約フォームに引き継がれ、当院の予約情報として保存されます。当日の施術の参考にするためです。予約しない場合は送信されません。
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
