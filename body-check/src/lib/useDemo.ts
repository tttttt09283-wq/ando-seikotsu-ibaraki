"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_EVENT, isDemo } from "./demo";

/**
 * 画面の表示用：デモモードかどうか（サーバー描画時は false、表示後に実際の値へ切り替え）
 * ページを移動したとき・デモの開始／終了のときにも読み直す（共通レイアウトは移動しても作り直されないため）
 */
export function useIsDemo(): boolean {
  const [demo, setDemoState] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    const read = () => setDemoState(isDemo());
    read();
    window.addEventListener(DEMO_EVENT, read);
    return () => window.removeEventListener(DEMO_EVENT, read);
  }, [pathname]);
  return demo;
}
