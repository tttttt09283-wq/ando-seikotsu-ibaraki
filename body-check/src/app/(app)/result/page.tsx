import type { Metadata } from "next";
import { ResultView } from "@/components/result/ResultView";

export const metadata: Metadata = { title: "チェック結果｜あんど式 カラダ年齢チェック" };

export default function ResultPage() {
  return <ResultView />;
}
