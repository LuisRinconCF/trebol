import { expect, it, vi } from "vitest";
import { installTrebolShortcut, trebolShortcut } from "../../lib/runtime/trebol-shortcut.ts";
it("restores only its own patch after the last lease is released", () => {
  const handler = Object.assign(vi.fn(), { [trebolShortcut]: true });
  class Runner { getShortcuts() { return new Map([["ctrl+n", { handler }]]); } createCommandContext() { return { reload: true }; } }
  const original = Runner.prototype.getShortcuts;
  const first = installTrebolShortcut(Runner), second = installTrebolShortcut(Runner);
  new Runner().getShortcuts().get("ctrl+n")!.handler();
  expect(handler).toHaveBeenCalledWith({ reload: true });
  first(); expect(Runner.prototype.getShortcuts).not.toBe(original);
  second(); expect(Runner.prototype.getShortcuts).toBe(original);
  second(); expect(Runner.prototype.getShortcuts).toBe(original);
});
it("does not overwrite a later host adapter", () => {
  class Runner { getShortcuts() { return new Map(); } createCommandContext() { return {}; } }
  const release = installTrebolShortcut(Runner);
  const next = () => new Map(); Runner.prototype.getShortcuts = next;
  release(); expect(Runner.prototype.getShortcuts).toBe(next);
});
