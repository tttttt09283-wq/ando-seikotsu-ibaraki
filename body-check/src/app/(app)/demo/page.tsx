"use client";

/**
 * デモの入り口（/demo）
 * デモモードにして、前回の回答を消してからメニュー画面（4つのチェック）を開きます。
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { setDemo } from "@/lib/demo";
import { clearState } from "@/lib/storage";

export default function DemoStartPage() {
  const router = useRouter();
  useEffect(() => {
    setDemo(true);
    clearState();
    router.replace("/");
  }, [router]);
  return <Spinner label="デモを準備しています…" />;
}
