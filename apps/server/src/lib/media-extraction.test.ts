// Phase 8 (ADR-0109): formalizes Phase 7's security audit (ADR-0108) as a permanent,
// automated test instead of a one-off sandbox check that only ever ran once. `isHttpUrl`
// is the one chokepoint every yt-dlp/ffmpeg subprocess call reads a pasted URL through
// (see its own doc comment in media-extraction.ts) — this suite is the "malformed URL
// test" implementation_plan.md's Phase 7 "done looks like" line points at.
import { describe, expect, it } from "vitest";
import { isHttpUrl } from "./media-extraction.js";

describe("isHttpUrl", () => {
  describe("rejects malicious/malformed input", () => {
    const maliciousInputs: Array<[string, unknown]> = [
      // Flag-injection: a positional arg a CLI parser could mistake for a flag.
      ["a yt-dlp flag-shaped string", "--exec=rm -rf /"],
      ["a bare short flag", "-rf"],
      ["a bare long flag", "--help"],
      // Shell metacharacters (irrelevant to spawn(argv[]), but should still fail URL parsing).
      ["a semicolon shell injection", "; rm -rf /"],
      ["a command substitution ($())", "$(rm -rf /)"],
      ["a command substitution (backticks)", "`rm -rf /`"],
      ["a chained command (&&)", "a && rm -rf /"],
      // Path traversal.
      ["a relative path traversal", "../../etc/passwd"],
      ["a file:// URL", "file:///etc/passwd"],
      // Non-http(s) schemes.
      ["a javascript: URL", "javascript:alert(1)"],
      ["a data: URL", "data:text/html,<script>alert(1)</script>"],
      ["an ftp:// URL", "ftp://example.com/video"],
      // Malformed strings.
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["a URL with an embedded space", "ht tp://example.com"],
      ["a bare hostname with no scheme", "example.com/video"],
    ];

    it.each(maliciousInputs)("rejects %s", (_label, input) => {
      expect(isHttpUrl(input)).toBe(false);
    });

    // Wrong JS types — mediaSourceFor reads `data.url` from a loosely-typed JSON blob,
    // so isHttpUrl is the type guard, not just a format check.
    const wrongTypes: Array<[string, unknown]> = [
      ["null", null],
      ["undefined", undefined],
      ["a number", 123],
      ["a plain object", { url: "https://example.com" }],
      ["an array", ["https://example.com"]],
    ];

    it.each(wrongTypes)("rejects %s", (_label, input) => {
      expect(isHttpUrl(input)).toBe(false);
    });
  });

  describe("accepts legitimate http(s) URLs", () => {
    const legitimateUrls = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "http://example.com/video.mp4",
      "https://vimeo.com/123456789",
    ];

    it.each(legitimateUrls)("accepts %s", (url) => {
      expect(isHttpUrl(url)).toBe(true);
    });
  });
});
