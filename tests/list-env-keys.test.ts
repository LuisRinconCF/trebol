import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const script = "tools/repo/list-env-keys.py";

describe("list-env-keys helper", () => {
  it("reads one JSON document and prints matching keys, never values", () => {
    const result = spawnSync("python3", [script, "APP_", "HOME"], {
      input: JSON.stringify(["APP_TOKEN=secret-value", "HOME=/tmp", "OTHER=hidden"]),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("APP_TOKEN\nHOME\n");
    expect(result.stdout).not.toContain("secret-value");
    expect(result.stdout).not.toContain("/tmp");
  });

  it("continues to accept one JSON document per invocation", () => {
    const documents = ["[\"FIRST=a\"]", "[\"SECOND=b\"]"].map((input) =>
      spawnSync("python3", [script], { input, encoding: "utf8" }),
    );
    expect(documents.map(({ status, stdout }) => [status, stdout])).toEqual([
      [0, "FIRST\n"],
      [0, "SECOND\n"],
    ]);
  });

  it("reports invalid JSON without attempting a second stdin parse", () => {
    const result = spawnSync("python3", [script], { input: "not-json", encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("invalid JSON input:");
  });
});
