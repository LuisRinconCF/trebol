#!/usr/bin/env node
// Executes trusted extension factories, but never starts a session or calls a model.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiHost } from "./pi-host.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const host = resolvePiHost({ executable: process.env.PI_EXECUTABLE });
const temporary = mkdtempSync(join(tmpdir(), "trebol-install-check-"));
const deadline = setTimeout(() => { console.error("FAIL package load exceeded 60 seconds"); process.exit(1); }, 60_000);
let status = 1;
try {
  const { DefaultResourceLoader, SettingsManager } = await import(host.sdkUrl);
  const cwd = join(temporary, "workspace"), agentDir = join(temporary, "agent");
  mkdirSync(cwd); mkdirSync(agentDir);
  const index = process.argv.indexOf("--extension");
  const entry = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && !JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).pi.extensions.includes(entry)) throw new Error("--extension must name an enabled manifest entry");
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [entry ? { source: repo, extensions: [entry] } : repo] }));
  const loader = new DefaultResourceLoader({ cwd, agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
    noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true });
  await loader.reload();
  const result = loader.getExtensions();
  for (const error of result.errors) console.error("FAIL", error);
  const own = result.extensions.filter((ext) => ext.path?.startsWith(repo + "/"));
  if (entry && own.length !== 1) throw new Error(`Expected one extension, got ${own.length}`);
  if (!own.length) throw new Error("Package registered no checkout extensions");
  console.log(`Pi ${host.version} (${host.root})`);
  console.log(`${own.length} checkout extensions; ${result.errors.length} load errors (isolated settings, no session started)`);
  status = result.errors.length ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(deadline);
  rmSync(temporary, { recursive: true, force: true });
}
process.exit(status);
