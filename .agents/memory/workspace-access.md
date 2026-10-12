---
name: Workspace access
description: Durable CREWON tenant, membership, role and business-email separation requirements.
---

CREWON business data belongs to private workspaces. Only authenticated users invited to a workspace may access its records. Parsley Electrical's primary Owner/Admin is Ryan; do not make the first person to sign up the owner. Business contact email is separate from user login and invitation addresses.

**Why:** The user explicitly required tenant isolation, invited team access, role-based permissions and a company inbox distinct from individual accounts.

**How to apply:** Enforce workspace membership and role permissions in every API and data query, not just the UI. Engineers should be limited to assigned jobs and necessary site/customer details; Office/Admin gets broad operations access; optional read-only roles remain read-only.
