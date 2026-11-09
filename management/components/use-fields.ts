"use client";
import { useState } from "react";

// フォームの入力を state で持つ（React 19 はサーバー処理のあとでフォームを初期化するため、
// エラーで戻ったときに書いた内容が消えないようにする）。bind("name") を Input / Select / Textarea に渡す
export function useFields(initial: Record<string, string> = {}) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const bind = (name: string) => ({
    name,
    value: values[name] ?? "",
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return { values, bind };
}
