import { describe, expect, it } from "vitest";
import { availableSlots, type SlotContext } from "./availability";
import { SEED_LOCATIONS } from "../repo/seed";
import type { AvailabilityRule } from "./types";

describe("夜間営業（20:00〜24:00）", () => {
  it("終了時刻 24:00 まで枠を出す（60分なら最終 23:00、90分なら 22:30）", () => {
    const locs = new Map(SEED_LOCATIONS.map((l) => [l.id, l]));
    const rules: AvailabilityRule[] = [{ id: "r", location_id: "home", weekday: 1, specific_date: null, start_time: "20:00", end_time: "24:00", is_closed: false, note: null }];
    const ctx: SlotContext = { location: locs.get("home")!, locations: locs, rules, blocks: [], reservations: [], now: new Date("2026-11-12T00:00:00Z") };
    expect(availableSlots(ctx, "2026-11-16", 60)).toEqual(["20:00", "20:30", "21:00", "21:30", "22:00", "22:30", "23:00"]);
    expect(availableSlots(ctx, "2026-11-16", 90).at(-1)).toBe("22:30");
  });
});
