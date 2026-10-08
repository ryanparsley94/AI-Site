---
name: Codegen Zod v3 patch
description: Orval output needs Zod 3 compatibility and validator-only barrel cleanup.
---

# Orval Codegen → Zod v3 Compatibility Patch

## The rule
Use `pnpm --filter @workspace/api-spec run codegen`, which performs compatibility cleanup automatically. If running raw Orval, perform the same cleanup before checking libraries:
```bash
node lib/api-spec/patch-zod.mjs
```
Then run `pnpm -w run typecheck:libs`.

**Why:** Raw Orval can generate `zod.int()` even though the validation package uses Zod 3, and can re-add a type barrel whose operation interfaces conflict with exported runtime validators. The generator configuration now also normalizes integer schemas for Zod 3. Preserve that transformation and keep the barrel cleanup compatible with configurations that do not emit separate type files.

**How to apply:** Any time the OpenAPI spec changes and codegen is re-run.
