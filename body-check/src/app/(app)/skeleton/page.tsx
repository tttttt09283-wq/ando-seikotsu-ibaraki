import type { Metadata } from "next";
import { SkeletonCheck } from "@/components/tools/SkeletonCheck";

export const metadata: Metadata = { title: "骨格タイプチェック" };

export default function SkeletonPage() {
  return <SkeletonCheck />;
}
