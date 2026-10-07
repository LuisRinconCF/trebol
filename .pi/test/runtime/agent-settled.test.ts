import { expect, it, vi } from "vitest";
import { onAgentSettled } from "../../lib/runtime/agent-settled.ts";
function harness() {
  const handlers = new Map<string, Function[]>();
  const pi = { on(name: string, fn: Function) { handlers.set(name, [...(handlers.get(name) ?? []), fn]); } };
  const emit = async (name: string, event: any = {}) => { for (const fn of handlers.get(name) ?? []) await fn(event, {}); };
  return { pi, emit, handlers };
}
it("delivers only the final attempt at native settlement", async () => {
  const h = harness(), handler = vi.fn(); onAgentSettled(h.pi, handler);
  await h.emit("agent_end", { messages: ["retry"] });
  await h.emit("agent_start");
  await h.emit("agent_end", { messages: ["final"] });
  expect(handler).not.toHaveBeenCalled();
  await h.emit("agent_settled");
  expect(handler).toHaveBeenCalledExactlyOnceWith({ type: "agent_settled", messages: ["final"] }, {});
  expect(h.handlers.has("session_before_compact")).toBe(false);
});
it("does not retain a previous session payload", async () => {
  const h = harness(), handler = vi.fn(); onAgentSettled(h.pi, handler);
  await h.emit("agent_end", { messages: ["old"] }); await h.emit("session_shutdown");
  await h.emit("agent_settled", { type: "agent_settled" });
  expect(handler).toHaveBeenCalledWith({ type: "agent_settled" }, {});
});
it("lets the host report subscriber errors", async () => {
  const h = harness(); onAgentSettled(h.pi, () => { throw new Error("reported"); });
  await expect(h.emit("agent_settled")).rejects.toThrow("reported");
});
