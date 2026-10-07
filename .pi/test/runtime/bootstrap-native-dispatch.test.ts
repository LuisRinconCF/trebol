import { expect, it, vi } from "vitest";
import { dispatchBootstrapHandoff } from "../../lib/runtime/bootstrap-dispatch.ts";

it("uses the host executor and returns the post-hook result", async () => {
  const result = { content: [{ type: "text", text: "accepted" }], details: {} };
  const executeTool = vi.fn(async () => ({ result, isError: false }));
  const signal = new AbortController().signal;
  expect(await dispatchBootstrapHandoff("TaskManage", { operations: [] }, signal, { executeTool }, ["TaskManage"])).toBe(result);
  expect(executeTool).toHaveBeenCalledExactlyOnceWith("TaskManage", { operations: [] }, { signal });
});
it("does not fall back around a host denial or inactive tool", async () => {
  const executeTool = vi.fn(async () => ({ result: { content: [{ type: "text", text: "policy denied" }] }, isError: true }));
  const signal = new AbortController().signal;
  await expect(dispatchBootstrapHandoff("Skill", {}, signal, { executeTool }, [])).rejects.toThrow("not active");
  expect(executeTool).not.toHaveBeenCalled();
  await expect(dispatchBootstrapHandoff("Skill", {}, signal, { executeTool }, ["Skill"])).rejects.toThrow("policy denied");
  expect(executeTool).toHaveBeenCalledTimes(1);
});

it("scopes lifecycle handoffs to their session and releases on shutdown", async () => {
  const { registerBootstrapHandoff } = await import("../../lib/runtime/bootstrap-dispatch.ts");
  const hooks = new Map<string, Function>();
  const pi = { on: (name: string, fn: Function) => hooks.set(name, fn) };
  const ctx = { sessionManager: { getSessionId: () => "handoff-owner-test" } };
  const execute = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
  registerBootstrapHandoff(pi, { name: "TaskManage", execute });
  const signal = new AbortController().signal;
  await expect(dispatchBootstrapHandoff("TaskManage", {}, signal, ctx, ["TaskManage"])).rejects.toThrow("unavailable");
  hooks.get("session_start")!({}, ctx);
  await dispatchBootstrapHandoff("TaskManage", {}, signal, ctx, ["TaskManage"]);
  await expect(dispatchBootstrapHandoff("TaskManage", {}, signal, { sessionManager: { getSessionId: () => "other" } }, ["TaskManage"])).rejects.toThrow("unavailable");
  hooks.get("session_shutdown")!();
  await expect(dispatchBootstrapHandoff("TaskManage", {}, signal, ctx, ["TaskManage"])).rejects.toThrow("unavailable");
  expect(execute).toHaveBeenCalledTimes(1);
});
