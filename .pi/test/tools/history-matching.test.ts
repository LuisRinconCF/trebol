import { describe, it, expect } from "vitest";
import { boundedHistorySnippet, compileHistoryRegex, redactHistoryText, truncateUtf8 } from "../../lib/tools/history-matching.js";

describe("history matching helpers", () => {
  it("uses RE2 safely and rejects unsupported syntax and oversized patterns", () => {
    expect(compileHistoryRegex("a+b", true).test("aaab")).toBe(true);
    expect(() => compileHistoryRegex("(a)\\1")).toThrow();
    expect(() => compileHistoryRegex("x".repeat(4097))).toThrow(/4096/);
    const hostile = compileHistoryRegex("(a+)+$");
    const started = Date.now();
    expect(hostile.test(`${"a".repeat(100000)}!`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it("redacts assignments, JSON values, bearer credentials and common tokens", () => {
    const result = redactHistoryText('api_key="secret" {"password":"abc"} Authorization: Bearer abc.def ghp_abcdefghijklmnopqrstuvwxyz');
    expect(result).not.toMatch(/secret|"abc"|Bearer\s+abc\.def|ghp_/);
    expect(result).toMatch(/\[REDACTED\]/);
    const header = redactHistoryText("Authorization: Bearer abc.def");
    expect(header).toContain("Authorization: Bearer [REDACTED]");
    expect(header).not.toContain("abc.def");
  });
  it("truncates on UTF-8 boundaries and bounds redacted snippets", () => {
    expect(truncateUtf8("a😀b", 4)).toBe("a");
    expect(Buffer.byteLength(truncateUtf8("😀x", 4))).toBe(4);
    expect(Buffer.byteLength(boundedHistorySnippet("x".repeat(3000), 32))).toBe(32);
  });
});
