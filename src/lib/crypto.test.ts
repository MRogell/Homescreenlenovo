import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

const S = "s".repeat(40);

describe("crypto", () => {
  it("roundtrip returns original", () => {
    expect(decryptToken(encryptToken("hemlig-token", S), S)).toBe("hemlig-token");
  });
  it("two encryptions of same text differ", () => {
    expect(encryptToken("x", S)).not.toBe(encryptToken("x", S));
  });
  it("tampered ciphertext throws", () => {
    const blob = encryptToken("x", S);
    const bad = blob.slice(0, -2) + (blob.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptToken(bad, S)).toThrow();
  });
  it("wrong secret throws", () => {
    expect(() => decryptToken(encryptToken("x", S), "t".repeat(40))).toThrow();
  });
  it("empty string roundtrips", () => {
    expect(decryptToken(encryptToken("", S), S)).toBe("");
  });
  it("does not contain the plaintext", () => {
    expect(encryptToken("synlig-text-123", S)).not.toContain("synlig");
  });
});
