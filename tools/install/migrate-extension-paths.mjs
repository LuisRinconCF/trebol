#!/usr/bin/env node
/** Preview only. Never rewrite personal settings or print their other fields. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function migrateFilters(filters, moves) {
  const changes = [], unresolved = [];
  const result = filters.map(value => {
    if (typeof value !== "string") return value;
    const prefix = /^[!+-]/.test(value) ? value[0] : "";
    const path = value.slice(prefix.length).replace(/^\.\//, "");
    if (moves[path]) { const next = prefix + moves[path]; changes.push({ from: value, to: next }); return next; }
    if (path.startsWith(".pi/extensions/")) unresolved.push(value);
    return value;
  });
  return { filters: result, changes, unresolved };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node tools/install/migrate-extension-paths.mjs <settings.json> (preview only)"); process.exit(1); }
  const settings = JSON.parse(readFileSync(file, "utf8"));
  const moves = JSON.parse(readFileSync(new URL("../repo/extension-moves.json", import.meta.url), "utf8"));
  let unresolved = false;
  for (const [index, pkg] of (settings.packages ?? []).entries()) {
    if (!pkg || typeof pkg === "string" || !Array.isArray(pkg.extensions)) continue;
    const result = migrateFilters(pkg.extensions, moves);
    if (!result.changes.length && !result.unresolved.length) continue;
    // Do not expose package URLs: they may contain credentials.
    console.log(JSON.stringify({ packageIndex: index, changes: result.changes, unresolved: result.unresolved }, null, 2));
    unresolved ||= result.unresolved.length > 0;
  }
  console.log("Preview only: no settings changed. Legacy glob/directory filters require manual review.");
  process.exitCode = unresolved ? 1 : 0;
}
