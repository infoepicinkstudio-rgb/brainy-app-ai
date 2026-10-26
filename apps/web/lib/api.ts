// Thin fetch wrapper for the Fastify backend (architecture.md §3.4 — base URL lives in
// config, never hardcoded, so localhost:4000 -> a future hosted API is a config change
// only). No env file is required for `npm run dev`/`npm run build`: this falls back to
// the same localhost:4000 the server listens on by default.

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// error-handling-conventions.md: "Every async action that can hang gets a timeout and
// resolves to either a result or a clear failure — never an indefinite spinner." This
// wrapper (and every api.* call) predates that rule's enforcement here — pre-existing
// Phase 1 gap, fixed while this file was already open for Phase 2's PATCH/DELETE work.
// 15s covers a slow "backend didn't start" case without making a normal click feel
// laggy; uploads get longer since a 50MB file genuinely needs more wall-clock time.
const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 60_000;

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { signal, clear } = withTimeout(DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal,
      headers: {
        // Only send Content-Type: application/json when there's actually a JSON body —
        // Fastify's body parser throws FST_ERR_CTP_EMPTY_JSON_BODY ("Body cannot be
        // empty...") on a bodyless request that still claims a JSON content type, which
        // every no-body POST/DELETE call here was doing (trash/restore/delete all send
        // no body). Confirmed live: it surfaced as an unhandled promise rejection with
        // zero on-screen feedback, silently no-opping actions like "Move to Trash".
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Can't reach the Brainy.ai backend. Check that the server is running.", 0);
    }
    throw err;
  } finally {
    clear();
  }

  if (!response.ok) {
    let message = `Request to ${path} failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Response had no JSON body — keep the generic message above.
    }
    throw new ApiError(message, response.status);
  }

  // A 204 No Content (every hard DELETE in this API) has no body at all — calling
  // .json() on it throws "Unexpected end of JSON input". Confirmed live: this was an
  // uncaught exception on every permanent board/node delete, which meant callers that
  // don't wrap the call in try/catch (handlePermanentDelete in the Trash page) never
  // reached their own follow-up state updates, even though the delete itself had
  // already succeeded on the server.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Multipart upload (file-node uploads, F-26) bypasses `request()` — it must NOT send
 * `Content-Type: application/json`, and a multipart body sets its own boundary header
 * automatically when `fetch` is given a FormData body directly.
 */
export async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const { signal, clear } = withTimeout(UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", body: formData, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The upload timed out. Check your connection and try again.", 0);
    }
    throw err;
  } finally {
    clear();
  }
  if (!response.ok) {
    let message = `Upload to ${path} failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // No JSON body — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}
