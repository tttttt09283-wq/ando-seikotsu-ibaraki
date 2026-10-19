import { ComingSoon } from "@/components/app/ComingSoon";

export const metadata = { title: "予定カレンダー" };

export default function CalendarPage() {
  return <ComingSoon title="予定取引カレンダー" phase="フェーズ3" items={["月表示の入金・支払予定（繰返しの回を含む）", "支払が集中する日の強調", "日付をタップしてその日の予定を確定・取消"]} note="それまでは「入出金一覧」と「ダッシュボードの14日以内の予定」を使ってください。" />;
}
