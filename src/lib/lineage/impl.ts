/**
 * Modern reference implementations for the lineage library's comparison tests. Each function's
 * source is ALSO stored as text in `core.ts` (the reviewable artifact); a test evaluates that text
 * and checks it behaves exactly like these compiled functions. This module only runs code written
 * in this repository; nothing ingested from outside is ever executed here.
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? B64[n & 63]! : "=";
  }
  return out;
}

export function crc32(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

/** Input: hex bytes ("00 01 f2 …"). Output: folded 16-bit one's-complement sum, hex. */
export function internetChecksumSum(hexBytes: string): string {
  const b = hexBytes.trim().split(/\s+/).map((h) => parseInt(h, 16));
  let sum = 0;
  for (let i = 0; i < b.length; i += 2) sum += (b[i]! << 8) | (b[i + 1] ?? 0);
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return sum.toString(16).padStart(4, "0");
}

export function internetChecksum(hexBytes: string): string {
  return ((~parseInt(internetChecksumSum(hexBytes), 16)) & 0xffff).toString(16).padStart(4, "0");
}

/** Input: "a,b" (non-negative integers). Euclid's algorithm by remainders. */
export function gcd(pair: string): string {
  let [a, b] = pair.split(",").map((s) => Number(s.trim())) as [number, number];
  while (b !== 0) [a, b] = [b, a % b];
  return String(a);
}

export const IMPLEMENTATIONS = {
  base64Encode,
  crc32,
  internetChecksumSum,
  internetChecksum,
  gcd,
} as const;
export type ImplementationId = keyof typeof IMPLEMENTATIONS;
