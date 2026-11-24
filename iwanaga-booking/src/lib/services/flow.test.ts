import { MemoryRepo } from "@/lib/repo/memory";
import { defineFlowSuite } from "@/test/flow-suite";

// ローカル代替モード（メモリ）で業務フロー全体をテストする。
// 同じシナリオを src/lib/repo/pg.test.ts で実際の PostgreSQL に対しても実行する（npm run test:db）。
defineFlowSuite(async () => new MemoryRepo());
