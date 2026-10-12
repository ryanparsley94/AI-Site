---
name: Drizzle schema drift
description: Safe handling of this workspace's development database when Drizzle push finds legacy schema conflicts.
---

This workspace's development database may contain legacy tables or schema differences that are not represented by the current Drizzle schema. A normal `drizzle-kit push` can require interactive rename/delete choices, and a forced push risks unrelated data or schema.

**Why:** Drizzle push in a non-interactive run stopped at a named-table conflict even though the intended new table was absent. Other existing features include historical tables and manually maintained migrations.

**How to apply:** For a narrowly additive change, verify the target object is absent, add a reviewed SQL migration that matches the Drizzle schema, apply only that migration to development, and leave other drift untouched. Never use push-force as a shortcut.
