---
name: OpenAI generated WAV headers
description: Browser playback and duration checks for OpenAI-generated WAV data.
---

When serving OpenAI-generated WAV bytes, normalize the RIFF and data chunk lengths from the returned buffer size before exposing the file to browser audio controls. Some responses contain sentinel size fields that otherwise produce nonsensical durations.

**Why:** Browsers can play the encoded samples but report extreme or invalid duration metadata when the size fields remain unset.

**How to apply:** Validate RIFF/WAVE structure, update both little-endian size fields, and reject malformed output before caching or serving it.
