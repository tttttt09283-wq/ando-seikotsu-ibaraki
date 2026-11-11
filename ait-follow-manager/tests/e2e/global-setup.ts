import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** DB を初期状態（架空シード）に戻し、日次抽出（Cron エンドポイント）を実行してタスクを用意する */
export default async function globalSetup() {
  execSync("npx supabase db reset", { stdio: "ignore" });
  const secret =
    process.env.CRON_SECRET ??
    readFileSync(".env.local", "utf8")
      .split("\n")
      .find((l) => l.startsWith("CRON_SECRET="))
      ?.split("=")[1];
  const deadline = Date.now() + 60_000;
  for (;;) {
    const res = await fetch("http://localhost:3000/api/cron/generate-tasks", { headers: { Authorization: `Bearer ${secret}` } }).catch(() => null);
    if (res?.ok) break;
    if (Date.now() > deadline) throw new Error(`タスク抽出に失敗しました（status ${res?.status}）`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
