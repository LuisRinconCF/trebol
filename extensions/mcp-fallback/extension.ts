import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { MCPManager } from "../../packages/tools/mcp/src/index.ts";
import { withDefaultToolRenderer } from "../../packages/runtime/core/src/tool-renderer.ts";
import { pushStartupNotice } from "../../.pi/lib/ui/startup-notices.ts";
type Pi = any;
function safeMcpError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(authorization|api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;)}]+/gi, "$1=<redacted>");
}

function loadMcpManifests(pi: Pi, cwd: string): any[] {
  if (Array.isArray(pi.mcpManifests)) return pi.mcpManifests;
  const candidates = [resolve(cwd, ".pi/mcp.json"), resolve(cwd, ".mcp.json")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const servers = raw?.mcpServers ?? raw?.servers ?? raw;
      if (!servers || typeof servers !== "object" || Array.isArray(servers)) continue;
      return Object.entries(servers).map(([id, value]: [string, any]) => ({ id, enabled: value?.enabled !== false, ...value, type: value?.type ?? (value?.command ? "stdio" : "http") }));
    } catch { return []; }
  }
  return [];
}

export function registerMcpFallback(pi: Pi, options: { cwd?: string; closed?: boolean } = {}) {
  const cwd = resolve(options.cwd ?? pi.getCwd?.() ?? process.cwd());
  const state: { mcp?: MCPManager } = {};
  let manifests: any[] = [];
  const discoverMcp = async () => {
    try {
      manifests = loadMcpManifests(pi, cwd).filter(m => m.enabled !== false);
      await state.mcp?.close();
      state.mcp = new MCPManager(manifests, { closed: options.closed ?? true, registerTool: tool => pi.registerTool(withDefaultToolRenderer(tool as any)) });
      for (const manifest of manifests) if (manifest.lazy !== true) await state.mcp.discover(manifest.id);
      pi.setActiveTools?.(Array.from(new Set([...(pi.getActiveTools?.() ?? []), ...(pi.getAllTools?.() ?? []).map((t: any) => t.name).filter((n: string) => n.startsWith("mcp__"))])));
    } catch (error) {
      state.mcp = undefined;
      pushStartupNotice(`MCP startup failed: ${safeMcpError(error)}`, "error");
    }
  };
  // Register synchronously during extension loading. Discovery is asynchronous,
  // but the slash command must exist before session_start or Pi treats /mcp as
  // ordinary model input.
  pi.registerCommand?.("swarm-mcp", { description: "Discover and inspect MCP servers", handler: async (args: string, ctx: any) => {
    if (!manifests.length) manifests = loadMcpManifests(pi, cwd).filter(m => m.enabled !== false);
    const requested = args.trim();
    if (requested === "discover" || requested.startsWith("discover ")) {
      const id = requested.slice("discover".length).trim();
      if (!id) return ctx.ui?.notify?.("Usage: /mcp discover <server>", "warning");
      try { const tools = await state.mcp?.discover(id); ctx.ui?.notify?.(`${id}: ${tools?.map((t: any) => t.name).join(", ") || "no tools"}`, "info"); }
      catch (error) { ctx.ui?.notify?.(error instanceof Error ? error.message : String(error), "error"); }
      return;
    }
    if (!state.mcp) await discoverMcp();
    if (!manifests.length) return ctx.ui?.notify?.("No MCP servers configured.", "info");
    const choice = await ctx.ui?.select?.("MCP servers", manifests.map(m => m.id));
    if (!choice) return;
    try {
      const tools = await state.mcp?.discover(choice);
      ctx.ui?.notify?.(`${choice}: ${tools?.map((t: any) => t.name).join(", ") || "no tools"}`, "info");
    } catch (error) { ctx.ui?.notify?.(error instanceof Error ? error.message : String(error), "error"); }
  }});
  pi.on?.("session_start", async (_event: unknown, ctx: any) => {
    // The installed adapter owns /mcp, resources, prompts and authentication.
    // Do not open a second connection using a different config dialect.
    if ((pi.getCommands?.() ?? []).some((command: any) => command.name === "pi-mcp")) return;
    await discoverMcp();
  });
  pi.on?.("session_shutdown", () => { void state.mcp?.close(); state.mcp = undefined; });
  pi.registerCommand?.("swarm-runtime", { description: "Inspect integrated Pi-Swarm runtime", handler: async (_args: string, ctx: any) => ctx.ui?.notify?.(`Pi-Swarm runtime active at ${cwd}; mcp=${manifests.length}`, "info") });
  return state;
}

export default function mcpFallback(pi: Pi) { return registerMcpFallback(pi); }
