import { expect, it } from "vitest";
import { inspectPackageSources, isManagedClone } from "../tools/install/package-sources.mjs";
import { migrateFilters } from "../tools/install/migrate-extension-paths.mjs";
import { executableNames } from "../tools/install/pi-host.mjs";
it.each(["git:github.com/cloverinternational/trebol@v1", "git+https://github.com/cloverinternational/trebol.git", "git+ssh://git@github.com/cloverinternational/trebol.git", "http://github.com/cloverinternational/trebol/"])("uses one clone identity for %s", source => {
  expect(inspectPackageSources([source], "/tmp/agent/settings.json", "/tmp/checkout").competing).toEqual([source]);
  expect(isManagedClone(source, "/missing-agent", "/missing-agent/git/github.com/cloverinternational/trebol")).toBe(true);
});
it("migrates exact signed paths but flags old globs", () => {
  const moves = { ".pi/extensions/old.ts": "extensions/new/index.ts" };
  expect(migrateFilters(["-.pi/extensions/old.ts", "+./.pi/extensions/old.ts", "!.pi/extensions/**"], moves)).toEqual({ filters: ["-extensions/new/index.ts", "+extensions/new/index.ts", "!.pi/extensions/**"], changes: [{from:"-.pi/extensions/old.ts",to:"-extensions/new/index.ts"},{from:"+./.pi/extensions/old.ts",to:"+extensions/new/index.ts"}], unresolved:["!.pi/extensions/**"] });
});
it("discovers Windows command suffixes", () => {
  expect(executableNames("win32", ".EXE;.CMD")).toEqual(["pi", "pi.exe", "pi.cmd"]);
});
