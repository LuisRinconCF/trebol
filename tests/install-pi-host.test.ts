import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePiHost } from "../tools/install/pi-host.mjs";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "pi-host-test-"))); roots.push(root);
  const pkg = join(root, "lib", "node_modules", "@earendil-works", "pi-coding-agent");
  mkdirSync(join(pkg, "dist", "bundle"), { recursive: true });
  mkdirSync(join(root, "bin"));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", version: "1.0.4" }));
  const cli = join(pkg, "dist", "bundle", "cli.js");
  writeFileSync(cli, "#!/usr/bin/env node\n"); chmodSync(cli, 0o755);
  writeFileSync(join(pkg, "dist", "index.js"), "export {};\n");
  symlinkSync(cli, join(root, "bin", "pi"));
  return { root, pkg, cli };
}
describe("installed Pi SDK resolution", () => {
  it("follows executable symlinks without assuming a global npm prefix", () => {
    const { root, pkg, cli } = fixture();
    expect(resolvePiHost({ path: join(root, "bin") })).toMatchObject({ root: pkg, executable: cli, version: "1.0.4" });
  });
  it("supports explicit installations outside PATH", () => {
    const { cli, pkg } = fixture();
    expect(resolvePiHost({ executable: cli, path: "" }).root).toBe(pkg);
  });
  it("fails clearly when Pi is missing", () => {
    expect(() => resolvePiHost({ path: "" })).toThrow("Pi executable not found");
  });
  it("rejects an installation without SDK output", () => {
    const { pkg, cli } = fixture(); rmSync(join(pkg, "dist", "index.js"));
    expect(() => resolvePiHost({ executable: cli })).toThrow("has no SDK");
  });
});
