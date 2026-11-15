import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["test/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000, fileParallelism: false },
});
