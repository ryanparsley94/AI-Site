---
name: Codegen Zod v3 patch
description: Every Orval codegen run requires a sed patch to fix zod.int() before typecheck passes.
---

# Orval Codegen → Zod v3 Compatibility Patch

## The rule
After every `pnpm exec orval --config ./orval.config.ts` run, immediately run:
```bash
sed -i 's/zod\.int()/zod.number().int()/g' lib/api-zod/src/generated/api.ts
```
Then run `pnpm -w run typecheck:libs`.

**Why:** Orval 8.23 generates `zod.int()` which is Zod v4 syntax. The project uses Zod v3. The sed patch rewrites all occurrences before typecheck.

**Also:** All `type: integer` fields in `openapi.yaml` must be written as `type: number` to avoid the same issue at the schema level.

**How to apply:** Any time the OpenAPI spec changes and codegen is re-run.
