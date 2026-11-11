import { execSync } from "node:child_process";

/** ローカル Supabase の接続情報を環境変数に設定する（既に設定済みならそれを使う） */
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const out = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => [m[1], m[2]]),
  );
  process.env.SUPABASE_URL ??= vars.API_URL;
  process.env.SUPABASE_ANON_KEY ??= vars.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= vars.SERVICE_ROLE_KEY;
  process.env.DATABASE_URL ??= vars.DB_URL;
}
process.env.CRON_SECRET ??= "test-cron-secret-0123456789";

// db reset 直後は API の再起動待ちが必要なため、応答するまで待つ
{
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/organizations?select=id&limit=1`, {
        headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      });
      if (res.ok) break;
    } catch {
      // 起動中
    }
    if (Date.now() > deadline) throw new Error("ローカル Supabase が起動していません（npx supabase start）");
    await new Promise((r) => setTimeout(r, 1000));
  }
}
