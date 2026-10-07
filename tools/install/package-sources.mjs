import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const canonical = (path) => {
  try { return realpathSync(path); }
  catch (error) { if (error.code === "ENOENT") return resolve(path); throw error; }
};

/** One parser shared by duplicate detection and installed-clone identification. */
export function trebolGitRepository(source) {
  if (typeof source !== "string") return undefined;
  const normalized = source.replace(/^git\+/, "").replace(/^git:/, "");
  const match = normalized.match(/^(?:(?:https?|ssh):\/\/)?(?:git@)?github\.com[/:](cloverinternational\/(?:swarm-pi|pi-swarm|trebol))(?:\.git)?(?:[@#][^/]+)?\/?$/i);
  return match ? { host: "github.com", repository: match[1] } : undefined;
}
export function isManagedClone(source, agentDir, repo) {
  const parsed = trebolGitRepository(source);
  return Boolean(parsed && canonical(join(agentDir, "git", parsed.host, parsed.repository)) === canonical(repo));
}

/** Pi resolves local package sources relative to the settings file. */
export function inspectPackageSources(packages, settingsPath, repo) {
  const sources = (packages ?? []).map(p => typeof p === "string" ? p : p?.source).filter(p => typeof p === "string");
  const local = sources.filter(p => !/^(?:[a-z][a-z+.-]*:|git@)/i.test(p)
    && canonical(resolve(dirname(settingsPath), p)) === canonical(repo));
  return { local, competing: sources.filter(p => trebolGitRepository(p)) };
}
