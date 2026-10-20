import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rejectCrossSite } from "@/lib/kiosk/origin";

const req = (headers: Record<string, string>, url = "http://localhost:3000/api/kiosk/auth") =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers } });

describe("共用端末 API の別サイト送信の拒否", () => {
  it("同じホストからの送信は通す（サーバー内部の URL と表記が違っても、受けたホスト名で判定）", () => {
    expect(rejectCrossSite(req({ origin: "http://127.0.0.1:3200", host: "127.0.0.1:3200" }))).toBeNull();
    expect(rejectCrossSite(req({ origin: "https://kintai.example.jp", host: "internal:3000", "x-forwarded-host": "kintai.example.jp" }))).toBeNull();
    expect(rejectCrossSite(req({ host: "localhost:3000" }))).toBeNull(); // Origin なし（同一オリジンの一部ブラウザ）
  });

  it("別サイトからの送信・JSON 以外は拒否", () => {
    expect(rejectCrossSite(req({ origin: "https://evil.example.com", host: "kintai.example.jp" }))?.status).toBe(403);
    expect(rejectCrossSite(req({ origin: "null", host: "kintai.example.jp" }))?.status).toBe(403);
    expect(rejectCrossSite(new NextRequest("http://localhost/api/kiosk/auth", { method: "POST", headers: { "content-type": "text/plain" } }))?.status).toBe(415);
  });
});
