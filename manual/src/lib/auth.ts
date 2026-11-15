import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Actor } from "./authz";
import { sql } from "./db";
import { loadActor } from "./repo/members";
import { decodeSession, encodeSession, SESSION_HOURS, type SessionData } from "./session-token";

const COOKIE = "mn_session";

// 開発用のログイン（本番では絶対に使えない）
export const devLoginEnabled = () =>
  process.env.MANUAL_DEV_LOGIN === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;

export async function setSession(data: Omit<SessionData, "exp">) {
  (await cookies()).set(COOKIE, encodeSession(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

// 毎回 DB から読み直す（退職・異動・権限の変更がすぐに効く）
export async function getActor(): Promise<Actor | null> {
  const s = decodeSession((await cookies()).get(COOKIE)?.value);
  if (!s) return null;
  if (s.via === "dev" && !devLoginEnabled()) return null;
  if (s.via === "pin") {
    const { pinSessionStillValid } = await import("./legacy");
    try {
      if (!s.k || !(await pinSessionStillValid(s.k, s.h ?? ""))) return null;
    } catch {
      return null; // 台帳を確認できないときは通さない
    }
  }
  return loadActor(sql(), s.m, s.via);
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}
