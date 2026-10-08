---
name: Development workflow ownership
description: A responsive preview can still be served by stale orphan processes after workspace changes.
---

A working HTTP preview is not proof that the current managed workflow is running the latest code. Workspace package/task-merge restarts have left older listeners serving while replacement web/API workflows failed with occupied ports.

**Why:** This occurred repeatedly after dependency changes and a task merge; blindly restarting does not resolve the listener ownership conflict.

**How to apply:** Check the managed workflow logs and the exact service listener ownership before assuming a code failure or restarting again. Keep managed artifact workflows; do not introduce duplicate servers or broadly terminate unrelated processes.
