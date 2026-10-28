# Runbook: Phase 5 media pipeline setup (yt-dlp, ffmpeg, Whisper model)

> **What this file is:** one-time setup for the three things Phase 5's lazy video/audio
> transcript pipeline needs on your own machine that `npm install` can't fetch for you —
> two standalone command-line tools and one model file. Written the same way
> `git-basics.md` is: no prior experience assumed, exact commands, one at a time. Full
> rationale for why these specific tools: `rules-decisions.md` ADR-0051 (no Python, no
> build toolchain) and ADR-0088 (why `@fugood/whisper.node` specifically).

---

## What you're installing, and why

- **`yt-dlp.exe`** — downloads the audio track from a video URL (YouTube, Vimeo, or
  anything else yt-dlp supports). A single standalone `.exe`, no Python install needed.
- **`ffmpeg.exe`** — converts whatever audio yt-dlp pulls down (or an uploaded
  audio/video file) into the plain 16kHz mono format Whisper actually reads.
- **A GGML model file** (`ggml-base.en.bin`, ~140MB) — the actual Whisper speech-to-text
  model. `@fugood/whisper.node` (installed via `npm install`, see Part 3) is the code
  that *runs* this model; it doesn't ship the model file itself.

All three are free, run entirely on your own machine, and need no API key or account —
consistent with Brainy's $0-ongoing-cost rule (ADR-0004).

---

## Part 1 — yt-dlp.exe

1. Download the latest standalone Windows build:
   ```
   https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
   ```
2. Create a folder for command-line tools if you don't already have one, e.g.
   `C:\tools\`, and move `yt-dlp.exe` into it.
3. Add that folder to your PATH so Brainy's server can just run `yt-dlp` by name:
   - Windows Search → "Edit the system environment variables" → **Environment
     Variables** → under **User variables**, select `Path` → **Edit** → **New** →
     type `C:\tools` (or wherever you put it) → **OK** on every dialog.
4. Open a **new** terminal (PATH changes don't apply to already-open terminals) and
   confirm:
   ```
   yt-dlp --version
   ```
   A version number means it worked.

## Part 2 — ffmpeg.exe

1. Download a Windows build from the project's own recommended source:
   ```
   https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
   ```
2. Extract the zip. Inside, find `bin\ffmpeg.exe` (a few folders deep) and copy it into
   the same `C:\tools\` folder from Part 1 (or extract the whole thing wherever you like
   and add its `bin` folder to PATH the same way as step 3 above).
3. New terminal, confirm:
   ```
   ffmpeg -version
   ```

*(If you'd rather not touch PATH at all: Brainy's server also reads two optional
environment variables, `YTDLP_PATH` and `FFMPEG_PATH`, which can point directly at each
`.exe`'s full path instead — set those in `apps/server/.env` if you go this route. PATH
is simpler if you're setting this up once, so that's what Part 1/2 above assume.)*

## Part 3 — Install the new npm dependency

Back in your VS Code terminal, from the repo root:
```
npm install
```
This pulls in `@fugood/whisper.node` (added to `apps/server/package.json` this
session) — a prebuilt native module, so this is a plain install, no compiler or build
step needed on your end.

## Part 4 — The GGML model file

1. Create the folder Brainy expects (already gitignored — this file is never committed,
   same as `uploads/` or `node_modules/`):
   ```
   mkdir models
   ```
   (run from the repo root, `D:\brainy-app-ai`)
2. Download the model:
   ```
   https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
   ```
   Save it as `models\ggml-base.en.bin` — the exact name and location
   `apps/server/src/lib/media-extraction.ts` looks for by default.
   - `base.en` is English-only and a good starting balance of speed vs. accuracy
     (~140MB). If you mostly need non-English transcripts later, the same page lists
     multilingual variants (`ggml-base.bin`, no `.en`) — swap the file and nothing else
     needs to change.

## Part 5 — Verify everything's wired up

1. Start the app as usual (`npm run dev` from the repo root).
2. On any board, paste a short YouTube link (or upload a short mp3) and connect it to a
   chat node.
3. Ask the chat node a question that needs that content. You should see an
   "Extracting transcript…" line appear in the chat node while the pipeline runs (this
   can take a minute or two the first time), then your answer, using the actual
   content.
4. Ask a second question referencing the same source — it should answer instantly, with
   no second "Extracting…" line (confirms the cache is working, not just the pipeline).

If step 3 instead shows a failure state right away, open a terminal in the repo and
check the server's own console output — a missing/misspelled PATH entry or model file
path shows up there as a plain error message (never a silent hang, per
`agents.md`/error-handling conventions), and usually names exactly which of the three
parts above didn't take.
