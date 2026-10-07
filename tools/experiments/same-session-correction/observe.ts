import { appendFileSync } from "node:fs";
import { registerAutoSkillsExtension } from "../../../extensions/autogenskills/extension.ts";
import { registerSwarmBash } from "../../../extensions/swarm-bash/extension.ts";
import metrics from "../../../extensions/conversation-metrics/extension.ts";

/** Instrument actual production tools; low configured budget, no fake block/state. */
export default function (pi: any) {
  const record = (data: any) => appendFileSync(process.env.CORRECTION_TRACE!, JSON.stringify({ at: Date.now(), ...data }) + "\n");
  const observed = new Proxy(pi, { get(target, key) {
    if (key === "registerTool") return (tool: any) => target.registerTool({ ...tool,
      async execute(id: string, input: any, ...rest: any[]) {
        record({ type: "entry", tool: tool.name, id, input });
        const result = await tool.execute(id, input, ...rest);
        record({ type: "return", tool: tool.name, id, content: result.content });
        return result;
      },
    });
    if (key === "appendEntry") return (type: string, data: any) => {
      if (/correction/.test(type)) record({ type: "correction_audit", entryType: type, data });
      return target.appendEntry(type, data);
    };
    const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
  } });
  registerAutoSkillsExtension(observed, { mode: "auto", dir: process.env.SWARM_AUTOGEN_DIR,
    toolCallBudget: 1, workingBudget: 1, curatorIdleDelayMs: 3600000 });
  registerSwarmBash(observed);
  metrics(pi);
  pi.on("before_provider_request", (e: any, ctx: any) => {
    record({ type: "request", session: ctx.sessionManager.getSessionId(), messages: e.payload.messages, tools: e.payload.tools });
  });
  pi.on("message_update", (e: any, ctx: any) => {
    const u = e.assistantMessageEvent;
    if (!u.type.startsWith("toolcall")) return;
    const c = e.message.content[u.contentIndex];
    record({ type: "stream", event: u.type, session: ctx.sessionManager.getSessionId(), index: u.contentIndex,
      id: c?.id, name: c?.name, delta: u.delta, args: c?.arguments });
  });
  pi.on("message_end", (e: any) => { if (e.message.role === "assistant") record({ type: "assistant", stopReason: e.message.stopReason, content: e.message.content?.filter((p: any) => p.type !== "thinking") }); });
  pi.on("agent_settled", (_e: any, ctx: any) => record({ type: "settled", session: ctx.sessionManager.getSessionId(), idle: ctx.isIdle() }));
  pi.on("tool_call", (e: any) => record({ type: "tool_call_observed", tool: e.toolName, id: e.toolCallId }));
}
