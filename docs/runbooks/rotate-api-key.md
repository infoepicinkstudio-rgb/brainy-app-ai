# Runbook: Rotate a leaked or compromised AI provider API key

**When to use this:** an API key for Claude, OpenAI, or Gemini was accidentally committed to git, pasted somewhere public, or you otherwise suspect it's been exposed.

**Related:** `docs/rules-decisions.md` ADR-0033 (secrets live only in SQLite), `docs/architecture.md` §6 (security posture).

## Steps

1. **Revoke the exposed key immediately** at the provider's own console (Anthropic Console / OpenAI dashboard / Google AI Studio) — do this *before* anything else below. A key sitting in `provider_credentials` is useless to an attacker once the provider has revoked it.
2. **Generate a new key** at the same console.
3. **Open Brainy's Settings** (in-app) and paste the new key into the matching provider field — this overwrites the row in `provider_credentials`, so the old (now-revoked) key is gone from the running app too.
4. **If the old key was ever committed to git**, it's still in the repo's history even after step 3 removes it from the live database — revoking it at the provider (step 1) is what actually neutralizes it, not removing it from a file. Don't rely on `git filter-repo`/history rewriting as the fix; treat the key as permanently burned and revoked, not as something to carefully scrub from history.
5. **Run a `gitleaks` scan** (`gitleaks detect` or equivalent) across the full repo history to confirm nothing else is exposed alongside it.
6. **Check `docs/bugs.md`** — if this happened because of an actual bug (e.g. a key ended up somewhere it shouldn't have, like a log file or a frontend network request), log it there so the root cause gets fixed, not just this one symptom.

## Notes

- This runbook is about *a key that's already out*. For keys that haven't leaked, nothing here applies — day-to-day key management is just Settings → paste → save.
- If you ever find yourself writing a key into anything other than Settings (a `.env` file, a script, a chat message to Claude), stop — that's exactly the pattern ADR-0033 exists to prevent.
