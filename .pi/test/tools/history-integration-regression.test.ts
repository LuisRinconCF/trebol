import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { historySearch, historyGet } from "../../lib/tools/swarm-history-tools.ts";

describe("history integration regression", () => {
  it("searches beyond the former retained-payload cap and accumulates terms across messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "history-regression-"));
    const cwd = join(root, "workspace");
    try {
      const lines = [JSON.stringify({ type: "session", id: "large", cwd, name: "large record" })];
      lines.push(JSON.stringify({ type: "message", id: "m1", timestamp: "2025-01-01T00:00:00Z", message: { role: "user", content: [{ type: "text", text: "alpha" }] } }));
      for (let i = 0; i < 8500; i++) lines.push(JSON.stringify({ type: "message", id: `f${i}`, message: { role: "assistant", content: [{ type: "text", text: "x".repeat(1000) }] } }));
      lines.push(JSON.stringify({ type: "message", id: "last", timestamp: "2025-01-02T00:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "omega needle" }] } }));
      const file = join(root, "large.jsonl");
      await writeFile(file, lines.join("\n") + "\n");
      const result = await historySearch({ query: "alpha needle" }, { root, cwd });
      expect(result.results.map((r: any) => r.id)).toContain("large");
      expect(result.complete).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("caps top-K with matching candidates and skips other workspaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "history-regression-"));
    const cwd = join(root, "workspace");
    try {
      for (let i = 0; i < 4; i++) await writeFile(join(root, `${i}.jsonl`), [
        JSON.stringify({ type: "session", id: `hit-${i}`, cwd, name: "needle" }),
        JSON.stringify({ type: "message", id: `m-${i}`, message: { role: "user", content: [{ type: "text", text: "needle" }] } }),
      ].join("\n") + "\n");
      await writeFile(join(root, "unrelated.jsonl"), JSON.stringify({ type: "session", id: "skip", cwd: join(root, "other") }) + "\n");
      const result = await historySearch({ query: "needle", limit: 2 }, { root, cwd });
      expect(result.results).toHaveLength(2);
      expect(result.truncated).toBe(true);
      expect(result.scan.files).toBe(5);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("handles a missing history root without stale loader references", async () => {
    const root = await mkdtemp(join(tmpdir(), "history-regression-"));
    try {
      const result = await historySearch({}, { root: join(root, "missing"), cwd: root });
      expect(result.results).toEqual([]);
      expect(result.complete).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("distinguishes absent IDs from IDs in another workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "history-regression-"));
    try {
      await writeFile(join(root, "other.jsonl"), JSON.stringify({ type: "session", id: "other", cwd: join(root, "other") }) + "\n");
      const runtime = { root, cwd: join(root, "current") };
      await expect(historyGet({ conversation_id: "absent" }, runtime)).rejects.toThrow(/conversation not found/);
      await expect(historyGet({ conversation_id: "other" }, runtime)).rejects.toThrow(/requested workspace/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
