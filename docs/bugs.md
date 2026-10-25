# Bugs — Brainy (brainy.ai)

> **What this file is:** a running error log. When something breaks — in testing (`testing.md`) or in real use — log it here *before* fixing it, so there's a record of what actually went wrong and why, not just the final patched state.
>
> **Why this exists:** when an AI coding session hits a bug, diagnosing from a clear symptom + console error + affected files is far more reliable than guessing from the code alone. This file is also where to look first if something that used to work seems broken again — check whether it's a regression of something already logged.

**How to log a bug:**
1. Copy the template below into a new entry.
2. Fill in **Symptom**, **Console/error output** (verbatim, not paraphrased), and **Files involved** *before* attempting a fix — diagnosis first, patch second.
3. Once fixed, fill in **Root cause** and **Fix**, and move the entry to the "Resolved" section below (don't delete it — a resolved bug is still useful history).

---

## Template

```
### BUG-### — <short title>
**Date:** YYYY-MM-DD
**Status:** Open | In progress | Resolved
**Feature/Task Flow:** (e.g. F-13 / TF-08)
**Symptom:** what the user sees/experiences
**Console/error output:**
```
<paste verbatim>
```
**Files involved:** <paths, once known>
**Root cause:** <once diagnosed>
**Fix:** <what actually changed>
```

---

## Open

*(none yet — no code has been written as of this doc's creation)*

---

## Resolved

*(none yet)*
