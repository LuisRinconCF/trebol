import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";

const canonical = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };

/** Pi resolves local package sources relative to the settings file. */
export function inspectPackageSources(packages, settingsPath, repo) {
  const sources = (packages ?? []).map((p) => typeof p === "string" ? p : p?.source).filter((p) => typeof p === "string");
  const local = sources.filter((p) => !/^(git:|npm:|https?:|ssh:)/.test(p)
    && canonical(resolve(dirname(settingsPath), p)) === canonical(repo));
  const competing = sources.filter((p) => /^(git:|https?:|ssh:)/.test(p)
    && /(?:github\.com[/:])cloverinternational\/(?:swarm-pi|pi-swarm|trebol)(?:\.git)?(?:@[^/]+)?\/?$/i.test(p));
  return { local, competing };
}
