import type { Metadata } from "next";
import { CheckFlow } from "@/components/check/CheckFlow";

export const metadata: Metadata = { title: "カラダチェック｜あんど式 カラダ年齢チェック" };

export default function CheckPage() {
  return <CheckFlow />;
}
