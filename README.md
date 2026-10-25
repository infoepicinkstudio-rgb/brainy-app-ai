# Brainy

A personal, local-only, infinite-canvas research and synthesis tool — a lean, purpose-built equivalent to [Poppy.ai](https://poppy.ai), built to run entirely on one machine at $0 ongoing cost.

This is a single-user project built by [Istiyak](https://github.com/) for his own content-research workflow (dropping in YouTube/Instagram research, notes, past content, and analytics onto a visual canvas, connecting them, and using an AI chat node to synthesize ideas from whatever's connected). It isn't built as a product for other people, though the repo is structured so it could be handed to another developer or shared publicly without a verbal walkthrough.

## What's here

If you're a person: start with this file, then skim `docs/prd.md` for what the product actually does.

If you're Claude Code (or another AI assistant) working on this repo: start with [`CLAUDE.md`](./CLAUDE.md) at the repo root — it's auto-loaded and points everywhere else.

## Stack

Next.js + React + TypeScript frontend (React Flow canvas, Zustand state, Tailwind + shadcn/ui), talking over HTTP/SSE to a separate Fastify backend (SQLite via Drizzle ORM, AI provider adapters for Claude/OpenAI/Gemini, a yt-dlp/ffmpeg/Whisper extraction pipeline). One monorepo, two small local processes — see `docs/architecture.md` for the full picture.

## Running it

*(Filled in once Phase 0 scaffolding exists — see `docs/implementation_plan.md`. For now: clone, `npm install`, `npm run dev`.)*

## Docs

Everything that explains *why* this project is shaped the way it is lives in [`docs/`](./docs/):

| File | What it covers |
|---|---|
| [`docs/rules-decisions.md`](./docs/rules-decisions.md) | Every decision made, with rationale (ADR log) |
| [`docs/architecture.md`](./docs/architecture.md) | The system as designed/built |
| [`docs/prd.md`](./docs/prd.md) | What's being built, for whom, phase roadmap |
| [`docs/feature.md`](./docs/feature.md) | Feature-by-feature spec with detailed user flows |
| [`docs/implementation_plan.md`](./docs/implementation_plan.md) | The technical build roadmap, phase by phase |
| [`docs/agents.md`](./docs/agents.md) | AI-assisted coding working conventions for this repo |
| [`docs/testing.md`](./docs/testing.md) | Manual test cases per feature |
| [`docs/bugs.md`](./docs/bugs.md) | Error log |
| [`docs/audit.md`](./docs/audit.md) | Periodic built-vs-planned reality checks |
| [`docs/runbooks/`](./docs/runbooks/) | Step-by-step operational procedures |

## License

Not yet decided — this is currently a private, personal project.
