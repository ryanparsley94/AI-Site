---
name: OpenAI model parameter compatibility
description: gpt-5.6-luna (and likely other new models) reject the max_tokens parameter; use max_completion_tokens instead.
---

# OpenAI model parameter compatibility

## Rule
Use `max_completion_tokens` instead of `max_tokens` when calling chat completions.

**Why:** `gpt-5.6-luna` returns a `400 unsupported_parameter` error if `max_tokens` is passed. The `max_completion_tokens` parameter is accepted.

**How to apply:** Any time you call `openai.chat.completions.create(...)`, use `max_completion_tokens` not `max_tokens`.
