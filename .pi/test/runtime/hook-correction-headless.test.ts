import { expect, it, vi } from "vitest";
import { installHookCorrection, correctionBlock } from "../../lib/runtime/hook-correction.ts";

it.each(["print", "json", "rpc", "tui"])("keeps %s denial in tool_call without speculative abort", async (mode) => {
  const handlers = new Map<string, Function[]>();
  const pi = { on: (event: string, handler: Function) => handlers.set(event, [...(handlers.get(event) ?? []), handler]), appendEntry: vi.fn() };
  const ctx = { mode, sessionManager: { getSessionId: () => "headless-correction-test" }, abort: vi.fn(), ui: {} };
  installHookCorrection(pi);
  const emit = async (name: string, event = {}) => { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); };
  try {
    await emit("session_start");
    await emit("message_update", { assistantMessageEvent: { type: "toolcall_delta", contentIndex: 0 }, message: { content: [{ id: "call", name: "write" }] } });
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(correctionBlock(pi, { toolCallId: "call", toolName: "write" }, ctx, "Focus a task")).toMatchObject({ block: true, reason: expect.stringContaining("Focus a task") });
  } finally { await emit("session_shutdown"); }
});
