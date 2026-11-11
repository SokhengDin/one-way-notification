import { describe, expect, test } from "bun:test";
import { generateApiKey, hashApiKey, plausibleApiKey } from "../src/domain/api-keys/api-keys.crypto";

describe("API key format", () => {
  test("generated keys pass their own checksum", () => {
    for (let i = 0; i < 200; i++) expect(plausibleApiKey(generateApiKey().secret)).toBe(true);
  });

  test("any single changed character is caught before the database", () => {
    const { secret } = generateApiKey();
    let caught = 0;
    for (let i = "ownk_".length; i < secret.length; i++) {
      if (secret[i] === "_") continue;
      const swapped = secret.slice(0, i) + (secret[i] === "a" ? "b" : "a") + secret.slice(i + 1);
      if (!plausibleApiKey(swapped)) caught++;
    }
    // CRC32 catches every single-character change
    expect(caught).toBe(secret.length - "ownk_".length - 1);
  });

  test("truncated or padded keys are rejected", () => {
    const { secret } = generateApiKey();
    expect(plausibleApiKey(secret.slice(0, -1))).toBe(false);
    expect(plausibleApiKey(`${secret}x`)).toBe(false);
    expect(plausibleApiKey(" ".repeat(600))).toBe(false);
    expect(plausibleApiKey("")).toBe(false);
  });

  test("legacy keys (any other shape) are still looked up", () => {
    expect(plausibleApiKey("demo-shop")).toBe(true);
  });

  test("the stored hash is SHA-256 of the whole key", () => {
    const key = generateApiKey();
    expect(key.key_hash).toBe(hashApiKey(key.secret));
    expect(key.key_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("characters are spread evenly (no modulo bias)", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      for (const char of generateApiKey().secret.slice(14, 57)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    expect(counts.size).toBe(62);
    const expected = (400 * 43) / 62;
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.35);
  });
});
