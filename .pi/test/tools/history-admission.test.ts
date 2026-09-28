import { describe, expect, it } from "vitest";
import { HistoryAdmission } from "../../lib/tools/history-admission.ts";

describe("history admission", () => {
  it("rejects concurrent requests without retaining a queue and releases on completion", async () => {
    const gate = new HistoryAdmission();
    let release!: () => void;
    const first = gate.run(undefined, () => new Promise<void>(resolve => { release = resolve; }));
    let called = false;
    await expect(gate.run(undefined, async () => { called = true; })).rejects.toThrow(/busy/);
    expect(called).toBe(false);
    release();
    await first;
    await expect(gate.run(undefined, async () => 42)).resolves.toBe(42);
  });

  it("recovers after errors and rejects pre-aborted requests before invoking work", async () => {
    const gate = new HistoryAdmission();
    await expect(gate.run(undefined, async () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await expect(gate.run(controller.signal, async () => { called = true; })).rejects.toThrow();
    expect(called).toBe(false);
    await expect(gate.run(undefined, async () => "healthy")).resolves.toBe("healthy");
  });

  it("survives 100 alternating failures and successful requests", async () => {
    const gate = new HistoryAdmission();
    for (let i = 0; i < 100; i++) {
      if (i % 2) await expect(gate.run(undefined, async () => { throw new Error("expected"); })).rejects.toThrow("expected");
      else await expect(gate.run(undefined, async () => i)).resolves.toBe(i);
    }
  });
});
