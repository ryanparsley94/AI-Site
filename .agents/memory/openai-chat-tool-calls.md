---
name: OpenAI Chat tool calls
description: Compatibility requirement for Replit OpenAI integration function calls using gpt-5.6-terra.
---

When using `gpt-5.6-terra` with function tools through Chat Completions, set `reasoning_effort: "none"`; without it, the integration proxy returns a 400 saying function tools with reasoning_effort are unsupported.

**Why:** A synthetic receptionist turn failed at runtime despite a successful build and valid tool schema. Retrying with `reasoning_effort: "none"` succeeded.

**How to apply:** For Chat Completions function-calling requests on this model, include the option. Alternatively use the Responses API if reasoning settings are needed.
