import { accessSync, constants, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Locate the SDK belonging to the actual PATH executable, not a second npm copy. */
export function resolvePiHost({ executable, path = process.env.PATH ?? "" } = {}) {
  const candidates = executable ? [resolve(executable)] : path.split(delimiter).filter(Boolean).map((dir) => join(dir, "pi"));
  let binary;
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); binary = realpathSync(candidate); break; } catch { /* next PATH entry */ }
  }
  if (!binary) throw new Error("Pi executable not found; install Pi or supply PI_EXECUTABLE as an absolute executable path.");
  for (let dir = dirname(binary); ; dir = dirname(dir)) {
    let pkg;
    try { pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")); } catch { /* not a package root */ }
    if (pkg?.name === "@earendil-works/pi-coding-agent") {
      const sdk = join(dir, "dist", "index.js");
      try { accessSync(sdk, constants.R_OK); } catch { throw new Error(`Pi at ${dir} has no SDK; use an npm-installed Pi for SDK checks.`); }
      return { executable: binary, root: dir, version: pkg.version, sdkUrl: pathToFileURL(sdk).href };
    }
    if (dirname(dir) === dir) break;
  }
  throw new Error(`Cannot locate Pi SDK from ${binary}. Shell wrappers and standalone binaries require PI_EXECUTABLE pointing to an npm-installed Pi CLI.`);
}
