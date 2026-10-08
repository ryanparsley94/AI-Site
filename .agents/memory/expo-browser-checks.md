---
name: Expo browser checks
description: Limits and pitfalls of browser-only checks for the CREWON mobile companion.
---

Expo can retain visited tab screens in the browser DOM, including duplicate offline banners. Browser assertions should target the active screen rather than assume shared text appears only once.

**Why:** Browser regression checks encountered duplicate matches after visiting Jobs and returning to Tasks; visibility filtering alone did not distinguish the retained screens.

**How to apply:** Scope navigation by its destination, and scope shared content to the intended screen. A single banner check may assert that at least one instance is visible.

Chromium's offline emulation can omit the NetworkInformation change notification on reconnect. A browser-only connectivity test may need to explicitly signal that notification after restoring the browser connection.

**Why:** Offline controls disabled correctly, but the reconnect assertion remained disabled until the browser connection API received a change event.

**How to apply:** Keep such simulation in test fixtures, not application code. Intercepted API/auth responses verify UI wiring only; report real sign-in, persistence, AI output, and native-device verification separately.
