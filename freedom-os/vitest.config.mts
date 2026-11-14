import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  // 日本時間の境界（0時前後）でも結果が変わらないことを確認するため、あえて UTC で実行する
  test: { environment: "node", include: ["src/**/*.test.ts"], env: { TZ: "UTC" } },
});
