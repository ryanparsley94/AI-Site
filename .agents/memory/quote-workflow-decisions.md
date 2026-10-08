---
name: Quote workflow safety decisions
description: Private costs, authoritative pricing, deposits and accepted-quote preservation.
---

Internal costs, profit, markup and unverified AI supplier information must never appear in the customer-facing quote/PDF. AI prices are optional, editable estimates, not live retailer lookups.

**Why:** The user requested a practical UK trades workflow rather than exporting an internal material-cost estimate.

**How to apply:** Keep selling prices separate from costs. Use per-line penny rounding and a shared authoritative calculation. A deposit is part of the quote total, not an additional charge; materials deposits use a configurable proportion of the materials selling amount including applicable VAT. Preserve legacy records on read and explain any recalculation during explicit editing.

Accepted quotes are fixed commercial snapshots. Conversion must retain their totals and must not create duplicates on repeated requests. Revisions should use a draft copy rather than changing an accepted record.

**Why:** The user explicitly required clean job/invoice conversion, existing quote/link preservation and no overwriting of customer data.

For invoice downloads, absent optional branding is valid, but failure to fetch configured branding or its logo should stop the download with an actionable error rather than silently produce an unbranded document.

**Why:** Contractors rely on consistent client-facing documents; a broken logo is different from choosing not to configure one.

**How to apply:** Preserve saved contractor branding, allow genuinely empty optional settings, and make configured-asset failures visible without changing the invoice's commercial snapshot.

Quote template switches in the builder are comparisons, not saved branding changes. PDF downloads continue to use saved company branding; accepted quotes use their commercial snapshot.

**Why:** A visual comparison must not silently change the contractor's shared branding or make a previously accepted document look different.

**How to apply:** Clearly distinguish the compared template from the PDF template. If adding a way to apply a comparison, require an explicit save action and preserve accepted snapshots.
