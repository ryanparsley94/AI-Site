---
name: PostgreSQL JSONB parameter typing
description: Type inference requirements for parameterized PostgreSQL JSON builder expressions.
---

**Rule:** Explicitly cast bound parameters passed to `jsonb_build_object` to their intended database types, such as integer IDs and text labels.

**Why:** An appointment booking committed successfully, but the follow-up JSONB metadata update failed with SQLSTATE 42P18 because PostgreSQL could not infer a parameter type. The API then reported failure despite the persisted booking.

**How to apply:** Add explicit casts to placeholder arguments in JSON/JSONB builder expressions, and test post-commit response updates so a secondary metadata error cannot make a successful primary operation appear to have failed.
