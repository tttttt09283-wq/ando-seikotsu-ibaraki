import { describe, expect, it } from "vitest";
import { IWANAGA_SUPABASE_ANON_KEY, IWANAGA_SUPABASE_URL, resolveSupabasePublic } from "./public-config";

describe("Supabase の公開設定", () => {
  it("未設定ならローカル代替モード（null）", () => {
    expect(resolveSupabasePublic(undefined, undefined)).toBeNull();
    expect(resolveSupabasePublic("", " ")).toBeNull();
  });
  it("正しい値はそのまま使う", () => {
    expect(resolveSupabasePublic("https://abc123.supabase.co/", "eyJ" + "a".repeat(40))).toEqual({ url: "https://abc123.supabase.co", anonKey: "eyJ" + "a".repeat(40) });
  });
  it("伏せ字の「•」などが混ざった値は使わず、本番プロジェクトの値にする", () => {
    expect(resolveSupabasePublic("https://abc123.supabase.co", "eyJhbGciOiJIUzI1•••••••••")).toEqual({ url: "https://abc123.supabase.co", anonKey: IWANAGA_SUPABASE_ANON_KEY });
    expect(resolveSupabasePublic("•••••••••••", "eyJ" + "a".repeat(40))?.url).toBe(IWANAGA_SUPABASE_URL);
  });
});
