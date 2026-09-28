import { RE2 } from "re2-wasm";

const MAX_PATTERN_BYTES = 4096;
const MAX_SNIPPET_BYTES = 2048;
const SECRET_KEYS = String.raw`(?:api[_-]?key|access[_-]?token|auth|secret|password|passwd|client[_-]?secret|refresh[_-]?token)`;
const REDACT_ASSIGNMENT = new RegExp(String.raw`(["']?${SECRET_KEYS}["']?\s*:\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}&]+)|(["']?${SECRET_KEYS}["']?\s*=\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}&]+)`, "gi");
const REDACT_BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const REDACT_TOKEN = /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

export function compileHistoryRegex(pattern: string, caseSensitive = false): Pick<RE2, "test" | "exec"> {
  if (typeof pattern !== "string") throw new TypeError("pattern must be a string");
  if (Buffer.byteLength(pattern, "utf8") > MAX_PATTERN_BYTES) throw new RangeError("pattern exceeds 4096 UTF-8 bytes");
  return new RE2(pattern, caseSensitive ? "u" : "iu");
}

export function redactHistoryText(text: string): string {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  return text.replace(/(Authorization\s*:\s*)(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1$2 [REDACTED]").replace(REDACT_ASSIGNMENT, (_match, jsonPrefix, _jsonValue, assignmentPrefix) => `${jsonPrefix ?? assignmentPrefix}[REDACTED]`).replace(REDACT_BEARER, "Bearer [REDACTED]").replace(REDACT_TOKEN, "[REDACTED]");
}

export function truncateUtf8(text: string, bytes: number): string {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("bytes must be a non-negative safe integer");
  const encoded = Buffer.from(text, "utf8");
  if (encoded.length <= bytes) return text;
  let end = bytes;
  while (end > 0 && (encoded[end] & 0xc0) === 0x80) end--;
  return encoded.subarray(0, end).toString("utf8");
}

export function boundedHistorySnippet(text: string, maxBytes = MAX_SNIPPET_BYTES): string {
  return truncateUtf8(redactHistoryText(text), maxBytes);
}
