import "server-only";
import { redirect } from "next/navigation";

// 処理結果をURLで次の画面に伝える（個人情報やPASSは載せない）
export function back(path: string, kind: "ok" | "err", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
