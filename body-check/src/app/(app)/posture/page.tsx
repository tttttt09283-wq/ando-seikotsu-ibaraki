import type { Metadata } from "next";
import { PostureCheck } from "@/components/tools/PostureCheck";

export const metadata: Metadata = { title: "AI姿勢チェック" };

export default function PosturePage() {
  return <PostureCheck />;
}
