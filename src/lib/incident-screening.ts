// Incomplete local sample screening; not malware analysis or a privacy guarantee.
export function screenDebrief(input: object) {
 const patterns = [
  ["Possible email / PII", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["Possible credential", /\b(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[=:]\s*\S{3,}|\bBearer\s+\S{8,}|\b(?:sk-|ghp_)[\w-]{8,}|-----BEGIN[^\n]*PRIVATE KEY-----/i],
  ["Possible phone / PII", /(?:\+\d{1,3}[ .-])?\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/],
  ["Possible private location", /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b|\b\d{1,5}\s+[\w ]+\s+(?:Street|Road|Avenue)\b/i],
  ["Unsafe instruction pattern", /<script\b|javascript:|ignore (?:all |previous )?instructions|disable (?:the )?(?:emergency stop|safety interlock)|bypass (?:permissions|safety)/i],
 ] as const;
 return Object.entries(input).flatMap(([field, value]) => typeof value === "string" ? patterns.filter(([, pattern]) => pattern.test(value)).map(([kind]) => ({ field, kind })) : []);
}