---
paths:
  - "apps/server/**"
  - "apps/web/**"
---

# Error handling & logging conventions

Full rationale: `docs/rules-decisions.md` ADR-0049. Full detail: `docs/architecture.md` §11, `docs/feature.md` F-25.

- Backend errors are logged to a file, not just console — anything that fails (provider calls, yt-dlp/ffmpeg, DB errors) must be inspectable after the fact, not just visible while a terminal happens to be open.
- **Never surface a raw stack trace or exception message to the UI.** Every user-facing error is a plain, specific sentence. The real detail goes in the log, not the screen.
- "Backend unreachable" is its own distinct error state from "the AI provider failed" — don't conflate a crashed `apps/server` process with a failed Claude/OpenAI/Gemini call.
- Cost-incurring or data-mutating actions (sending a Native-API chat prompt, creating a board, saving Settings) disable their control for the duration of the in-flight request — no double-submits. A double chat-send is a real money bug, not a cosmetic one.
- Every async action that can hang gets a timeout and resolves to either a result or a clear failure — never an indefinite spinner.
- Backend CORS only accepts requests from the frontend's own origin (`localhost:3000`) — never a wildcard. "Localhost-only" binding alone does not stop a browser-side cross-origin request.
