#!/usr/bin/env node
/** Real-host registration snapshot. No session/model calls; trusted factories execute. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiHost } from "./pi-host.mjs";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
for (const flag of ["--write", "--compare"]) {
  const index = process.argv.indexOf(flag);
  if (index >= 0 && (!process.argv[index + 1] || process.argv[index + 1].startsWith("--"))) throw new Error(`${flag} requires a path`);
}
const dir = mkdtempSync(join(tmpdir(), "trebol-inventory-"));
const timeout = setTimeout(() => { console.error("Inventory timeout"); rmSync(dir, { recursive: true, force: true }); process.exit(1); }, 60_000);
let code = 0;
try {
  const { DefaultResourceLoader, SettingsManager } = await import(resolvePiHost({ executable: process.env.PI_EXECUTABLE }).sdkUrl);
  const agentDir = join(dir, "agent"); mkdirSync(agentDir);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [repo] }));
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir, settingsManager: SettingsManager.create(dir, agentDir), noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true });
  await loader.reload(); const result = loader.getExtensions();
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  const records = result.extensions.filter(e => e.path.startsWith(repo + "/")).map(e => ({
    path: e.path.slice(repo.length + 1),
    tools: [...e.tools].map(([name, value]) => ({ name, description: value.definition?.description ?? value.description, parameters: value.definition?.parameters ?? value.parameters })).sort((a,b) => a.name.localeCompare(b.name)),
    commands: [...e.commands.keys()].sort(), shortcuts: [...e.shortcuts.keys()].sort(),
    flags: [...e.flags.keys()].sort(), messageRenderers: [...e.messageRenderers.keys()].sort(), entryRenderers: [...e.entryRenderers.keys()].sort(),
    events: [...e.handlers].map(([name, handlers]) => ({name, count: handlers.length})).sort((a,b) => a.name.localeCompare(b.name)),
  }));
  const snapshot = { records };
  const output = process.argv.indexOf("--write");
  if (output >= 0) writeFileSync(resolve(process.argv[output + 1]), JSON.stringify(snapshot, null, 2) + "\n");
  const compare = process.argv.indexOf("--compare");
  if (compare >= 0) {
    const previous = JSON.parse(readFileSync(resolve(process.argv[compare + 1]), "utf8"));
    if (process.argv.includes("--surface-only")) {
      for (const field of ["tools", "commands", "shortcuts", "flags", "messageRenderers", "entryRenderers"]) {
        const normalize = s => s.records.flatMap(r => r[field]).map(value => JSON.stringify(value)).sort();
        if (JSON.stringify(normalize(previous)) !== JSON.stringify(normalize(snapshot))) throw new Error(`Public surface mismatch: ${field}`);
      }
      console.log("PASS aggregate public surface parity; lifecycle ownership intentionally excluded");
    } else {
      const normalize = s => s.records.map(({path, ...record}) => JSON.stringify(record)).sort();
      if (JSON.stringify(normalize(previous)) !== JSON.stringify(normalize(snapshot))) throw new Error("Registration parity mismatch (tools/schema/commands/events/renderers/flags/shortcuts)");
      console.log("PASS exact registration parity (ignoring entry paths)");
    }
  }
  console.log(`${records.length} extension entries, ${records.reduce((n,r)=>n+r.tools.length,0)} tools, ${records.reduce((n,r)=>n+r.commands.length,0)} commands`);
} catch (error) { console.error(error); code = 1; }
finally { clearTimeout(timeout); rmSync(dir, { recursive: true, force: true }); }
process.exit(code);
