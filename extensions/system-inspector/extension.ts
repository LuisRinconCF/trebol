import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SkillLoader } from "../../packages/context/skills/src/index.ts";
import { resolveActiveSystemPrompt } from "../system-prompts/extension.ts";

/** Inspect the exact prompt/resources exposed by the current Pi-Swarm process. */
export interface InspectorContext {
  cwd?: string;
  ui?: { editor?: (title: string, content?: string) => Promise<string | undefined>; notify?: (message: string, type?: string) => void };
}

/**
 * The Pi-Swarm checkout this process was loaded from. When installed as a
 * Pi package (`pi install <checkout>` / `git:`) the workspace is some other
 * project, so extensions and packages must be enumerated from here, not cwd.
 * This file lives at <checkout>/extensions/system-inspector/.
 */
const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function packageNames(root: string): string[] {
  const result: string[] = [];
  try {
    // npm workspaces: packages/<layer>/<name>/package.json
    const packages = join(root, "packages");
    for (const layer of readdirSync(packages)) {
      let names: string[] = [];
      try { names = readdirSync(join(packages, layer)); } catch { continue; }
      for (const name of names) {
        const path = join(packages, layer, name, "package.json");
        if (!existsSync(path)) continue;
        try {
          const pkg = JSON.parse(readFileSync(path, "utf8"));
          if (typeof pkg.name === "string") result.push(`${pkg.name} (packages/${layer}/${name})`);
        } catch { /* ignore malformed package files */ }
      }
    }
  } catch { /* workspace may be unavailable during early startup */ }
  return result.sort();
}

function extensionNames(root: string): string[] {
  const result: string[] = [];
  try {
    const entries = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))?.pi?.extensions;
    if (!Array.isArray(entries)) return [];
    for (const entry of entries) {
      if (typeof entry !== "string") continue;
      const name = entry.replace(/^extensions\//, "").replace(/\/index\.ts$/, "");
      if (name !== "system-inspector") result.push(name);
    }
  } catch { return []; }
  return result;
}

function toolNames(pi: any): string[] {
  try { return (pi.getAllTools?.() ?? []).map((tool: any) => tool.name).filter((name: any) => typeof name === "string").sort(); }
  catch { return []; }
}

function snapshot(pi: any, cwd: string, prompt: string): string {
  const tools = toolNames(pi);
  // Only Pi-local skills belong in this inspector; Swarm skills are explicit.
  const skills = new SkillLoader({ cwd, home: process.env.HOME, closed: true, cliPaths: [join(cwd, ".pi", "skills")] }).load();
  const extensions = extensionNames(CHECKOUT);
  const packages = packageNames(CHECKOUT);
  return [
    "PI-SWARM RUNTIME INSPECTOR",
    `Workspace: ${cwd}`,
    `Pi-Swarm checkout: ${CHECKOUT}`,
    `Generated: ${new Date().toISOString()}`,
    "",
    `SYSTEM PROMPT (${prompt.length} characters)`,
    prompt || "(not captured yet; send a prompt or inspect after agent start)",
    "",
    `TOOLS (${tools.length})`,
    tools.join("\n") || "(none)",
    "",
    `SKILLS (${skills.skills.length})`,
    skills.skills.map(skill => `- ${skill.name} [${skill.source}] — ${skill.description || "(no description)"}`).join("\n") || "(none)",
    skills.diagnostics.length ? `\nSkill diagnostics:\n${skills.diagnostics.map(d => `- ${d.path}: ${d.message}`).join("\n")}` : "",
    "",
    `EXTENSIONS (${extensions.length})`,
    extensions.join("\n") || "(none)",
    "",
    `BUILT PACKAGES / CAPABILITIES (${packages.length})`,
    packages.join("\n") || "(none)",
  ].join("\n");
}

export function registerSystemInspector(pi: any): void {
  let currentPrompt = "";
  let cwd = resolve(pi.getCwd?.() ?? process.cwd());
  const open = async (ctx?: InspectorContext) => {
    const text = snapshot(pi, resolve(ctx?.cwd ?? cwd), currentPrompt);
    if (ctx?.ui?.editor) await ctx.ui.editor("Pi-Swarm system · prompt, tools, skills, build", text);
    else ctx?.ui?.notify?.(`Pi-Swarm system inspected: ${toolNames(pi).length} tools, ${new SkillLoader({ cwd }).load().skills.length} skills`, "info");
  };
  pi.on?.("before_agent_start", (event: any, ctx: any) => {
    currentPrompt = typeof event?.systemPrompt === "string" ? event.systemPrompt : currentPrompt;
    cwd = resolve(ctx?.cwd ?? cwd);
  });
  pi.on?.("session_start", (_event: any, ctx: any) => {
    cwd = resolve(ctx?.cwd ?? pi.getCwd?.() ?? process.cwd());
    const skills = new SkillLoader({ cwd, home: process.env.HOME, closed: true, cliPaths: [join(cwd, ".pi", "skills")] }).load();
    // Keep the large prompt out of the normal transcript. Pi toggles a custom
    // header's `setExpanded` state together with its built-in Ctrl+O view, so
    // the full inspector is available only while that view is expanded.
    ctx?.ui?.setHeader?.((_tui: any, theme: any) => {
      let content = "";
      const component: any = {
        render(width: number): string[] {
          if (width <= 0) return content.split("\n");
          return content.split("\n").flatMap((line) => {
            if (!line) return [""];
            const rows: string[] = [];
            for (let offset = 0; offset < line.length; offset += width) rows.push(line.slice(offset, offset + width));
            return rows;
          });
        },
        invalidate() {},
      };
      component.setExpanded = (expanded: boolean) => {
        content = expanded ? snapshot(pi, cwd, currentPrompt) : "";
      };
      component.setExpanded(false);
      return component;
    });
  });
  // `/system` remains available for a dedicated editor view, including in
  // headless-compatible extension contexts where a header is not rendered.
  pi.registerCommand?.("system", { description: "Inspect the current prompt and all built runtime resources", handler: async (_args: string, ctx: any) => open(ctx) });
}

export default function systemInspectorExtension(pi: any): void { registerSystemInspector(pi); }
