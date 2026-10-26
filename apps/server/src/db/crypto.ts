// Encrypt-at-rest for provider_credentials.api_key — ADR-0060, architecture.md §6.
//
// AES-256-GCM with a random IV per write and the auth tag stored alongside the
// ciphertext. The 32-byte key is generated once on first server boot (if
// apps/server/.local-key doesn't exist yet) and read from that gitignored file on
// every boot after — never hardcoded, never derived from anything guessable, never
// sent to the frontend, never logged.
//
// Stored format: "<iv base64>:<authTag base64>:<ciphertext base64>".

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/server/src/db -> apps/server root is two levels up
const KEY_PATH = path.resolve(__dirname, "../../.local-key");
const KEY_BYTES = 32;

function loadOrCreateKey(): Buffer {
  if (existsSync(KEY_PATH)) {
    const hex = readFileSync(KEY_PATH, "utf8").trim();
    const key = Buffer.from(hex, "hex");
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `apps/server/.local-key is not a valid ${KEY_BYTES}-byte key. Delete the file to ` +
          "generate a new one — any provider API keys saved under the old key will stop " +
          "decrypting, so re-enter them in Settings afterward."
      );
    }
    return key;
  }
  const key = randomBytes(KEY_BYTES);
  // 0o600: readable/writable by the owner only.
  writeFileSync(KEY_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}

const KEY = loadOrCreateKey();

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

// Used by Phase 4's provider adapters when they actually call out to Claude/OpenAI/
// Gemini — not exercised yet in Phase 1, since the frontend never sees a raw key.
export function decrypt(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Stored provider API key is not in the expected encrypted format.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
