import { describe, expect, it } from "vitest";
import { inspectPackageSources } from "../tools/install/package-sources.mjs";

describe("install package identity", () => {
  const settings = "/home/user/.pi/agent/settings.json";
  const repo = "/home/user/Work/trebol";
  it("resolves local sources and preserves filtered package identity", () => {
    expect(inspectPackageSources([{ source: "../../Work/trebol", extensions: ["-example.ts"] }], settings, repo))
      .toEqual({ local: ["../../Work/trebol"], competing: [] });
  });
  it("does not mistake a historical Git clone for this checkout", () => {
    const old = "git:github.com/cloverinternational/swarm-pi@651164c";
    expect(inspectPackageSources([old, repo], settings, repo)).toEqual({ local: [repo], competing: [old] });
    expect(inspectPackageSources([old], settings, repo).local).toEqual([]);
  });
  it("ignores unrelated similarly named packages", () => {
    expect(inspectPackageSources(["git:github.com/other/trebol", "npm:trebol", "/other/trebol"], settings, repo))
      .toEqual({ local: [], competing: [] });
  });
});
