import { readFileSync, writeFileSync } from "node:fs";

// Orval emits Zod 4 integer helpers even though the API validation package uses Zod 3.
const apiPath = new URL("../api-zod/src/generated/api.ts", import.meta.url);
writeFileSync(apiPath, readFileSync(apiPath, "utf8").replaceAll("zod.int()", "zod.number().int()"));
// Type-only operation interfaces duplicate exported validators; the server barrel
// must export validators, not Orval's additional type barrel.
const indexPath = new URL("../api-zod/src/index.ts", import.meta.url);
writeFileSync(indexPath, readFileSync(indexPath, "utf8").replace(/^export \* from ['"]\.\/generated\/types['"];?\s*$/m, ""));
