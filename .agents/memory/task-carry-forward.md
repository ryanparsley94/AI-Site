---
name: Task carry-forward dates
description: Calendar-day interpretation and deadline preservation for overdue contractor tasks.
---

Carry-forward means surfacing unfinished work, not resetting its deadline or creating another copy. Only pending tasks with a past due date qualify; creation age alone must not flag an undated task.

**Why:** The requested reminder is explicitly driven by due_date. Changing that date each day would hide how long work has been overdue.

**How to apply:** Preserve the original deadline when displaying or completing carried-forward work.

Treat task deadlines as calendar dates and compare them with the browser's local calendar day. Do not convert a midnight-UTC date-only deadline into a local instant.

**Why:** There is no confirmed company timezone policy for these reminders. Using the contractor's local day supports the daily workflow, while converting stored midnight UTC into local time can show the previous date in negative-offset timezones.

**How to apply:** Keep the stored due-date calendar portion stable, refresh the daily comparison at midnight and after waking a tab, and use calendar arithmetic rather than elapsed local hours around daylight-saving changes. Revisit this policy if a company timezone is explicitly chosen.
