---
name: Quote workflow safety decisions
description: Private costs, authoritative pricing, deposits and accepted-quote preservation.
---

Internal costs, profit, markup and unverified AI supplier information must never appear in the customer-facing quote/PDF. AI prices are optional, editable estimates, not live retailer lookups.

**Why:** The user requested a practical UK trades workflow rather than exporting an internal material-cost estimate.

**How to apply:** Keep selling prices separate from costs. Use per-line penny rounding and a shared authoritative calculation. A deposit is part of the quote total, not an additional charge; materials deposits use a configurable proportion of the materials selling amount including applicable VAT. Preserve legacy records on read and explain any recalculation during explicit editing.

Accepted quotes are fixed commercial snapshots. Conversion must retain their totals and must not create duplicates on repeated requests. Revisions should use a draft copy rather than changing an accepted record.

**Why:** The user explicitly required clean job/invoice conversion, existing quote/link preservation and no overwriting of customer data.
