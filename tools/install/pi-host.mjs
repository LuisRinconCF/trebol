import { accessSync, constants, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function executableNames(platform, pathExt = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD") {
  return platform === "win32" ? ["pi", ...pathExt.split(";").filter(Boolean).map(ext => "pi" + ext.toLowerCase())] : ["pi"];
}
/** Locate the actual host. npm's Windows shims live beside node_modules. */
export function resolvePiHost({ executable, path = process.env.PATH ?? "", platform = process.platform } = {}) {
  const candidates = executable ? [resolve(executable)] : path.split(delimiter).filter(Boolean).flatMap(dir => executableNames(platform).map(name => join(dir, name)));
  let binary;
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      binary = realpathSync(candidate);
      break;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
  }
  if (!binary) throw new Error("Pi executable not found; install Pi or supply PI_EXECUTABLE as an absolute executable path.");
  const roots = [];
  if (platform === "win32") roots.push(join(dirname(binary), "node_modules", "@earendil-works", "pi-coding-agent"));
  for (let dir = dirname(binary); ; dir = dirname(dir)) {
    roots.push(dir);
    if (dirname(dir) === dir) break;
  }
  for (const dir of roots) {
    let pkg;
    try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); }
    catch (error) {
      if (error instanceof SyntaxError || ["ENOENT", "ENOTDIR"].includes(error.code)) continue;
      throw error;
    }
    if (pkg?.name !== "@earendil-works/pi-coding-agent") continue;
    const sdk = join(dir, "dist", "index.js");
    try { accessSync(sdk, constants.R_OK); }
    catch { throw new Error(`Pi at ${dir} has no SDK; use an npm-installed Pi for SDK checks.`); }
    return { executable: binary, root: dir, version: pkg.version, sdkUrl: pathToFileURL(sdk).href };
  }
  throw new Error(`Cannot locate Pi SDK from ${binary}. Shell wrappers and standalone binaries require PI_EXECUTABLE pointing to an npm-installed Pi CLI.`);
}

export function extensionEntries(repo) {
  const entries = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"))?.pi?.extensions;
  if (!Array.isArray(entries) || entries.some(entry => typeof entry !== "string")) throw new Error("Invalid pi.extensions manifest");
  return entries;
}
