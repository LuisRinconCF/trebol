import { boundedHistoryJSON, historyGet, historyRootFromContext, historySearch } from "../../.pi/lib/tools/swarm-history-tools.ts";
import { vaultJSONXML, type VaultRuntime } from "../../.pi/lib/tools/swarm-vault-tools.ts";
import { newErrorID } from "../../.pi/lib/tools/swarm-bash.ts";
import { applySwarmSurface } from "../../.pi/lib/runtime/swarm-tool-surface.ts";
import { CONTRACTS } from "../../.pi/lib/tools/swarm-history-tools.contract.ts";
import { sortKeysDeep } from "../../.pi/lib/runtime/swarm-transport-parity.ts";
import { historyAdmission } from "../../.pi/lib/tools/history-admission.ts";

type Pi = any;
const registrations = new WeakSet<object>();
const names = ["HistorySearch", "HistoryGet"] as const;
const labels: Record<string, string> = Object.fromEntries(names.map((name) => [name, name]));

function okay(value: unknown, xml = false) {
  // history.go jsonResult marshals a map[string]any → keys sorted at every level.
  const text = xml ? vaultJSONXML(value) : JSON.stringify(sortKeysDeep(value));
  return { content: [{ type: "text", text }], details: value };
}
function failed(name: string, error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  if ((name === "HistorySearch" || name === "HistoryGet") && !message.startsWith(`${name}:`)) message = `${name}: ${message}`;
  // Pi flags a tool result as failed only when execute() throws; the message
  // becomes the result content verbatim (docs/extensions.md "Signaling errors").
  throw new Error(`Error executing ${name}: ${message} (error_id=${newErrorID()})`);
}

export function registerSwarmHistoryVaultTools(pi: Pi, options: { historyRoot?: string; cwd?: string; vault?: VaultRuntime } = {}): void {
  if (registrations.has(pi as object)) return;
  registrations.add(pi as object);
  let sessionContext: any;
  pi.on?.("session_start", (_event: any, ctx: any) => { sessionContext = ctx; });
  const register = (name: typeof names[number], run: (p: any, ctx: any, signal?: AbortSignal) => Promise<any> | any, xml = false) => pi.registerTool?.(applySwarmSurface({
    name, label: labels[name], ...CONTRACTS[name],
    async execute(_id: string, params: any, _signal: AbortSignal | undefined, _update: unknown, ctx: any) {
      try {
        return await historyAdmission.run(_signal, async () => {
        const value = await run(params ?? {}, ctx ?? sessionContext, _signal);
        if (name === "HistoryGet") {
          const bounded = boundedHistoryJSON(value, params?.max_chars ?? 12000);
          return { content: [{ type: "text", text: bounded.text }], details: bounded.value };
        }
        return okay(value, xml);
        });
      } catch (error) { return failed(name, error); }
    },
  }));
  const historyRuntime = (ctx: any, signal?: AbortSignal) => ({ root: options.historyRoot ?? historyRootFromContext(ctx ?? sessionContext), cwd: options.cwd ?? ctx?.cwd ?? sessionContext?.cwd ?? pi.getCwd?.() ?? process.cwd(), signal });
  register("HistorySearch", (p, ctx, signal) => historySearch(p, historyRuntime(ctx, signal)));
  register("HistoryGet", (p, ctx, signal) => historyGet(p, historyRuntime(ctx, signal)));
}

export default function swarmHistoryVaultToolsExtension(pi: Pi): void { registerSwarmHistoryVaultTools(pi); }
