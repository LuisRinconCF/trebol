import { describe, expect, it } from "vitest";
import { formatReadCall, readToolRenderer } from "../../lib/tools/swarm-read-renderer.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

describe("Read tool renderer", () => {
  it("renders the path and a valid requested range", () => {
    expect(formatReadCall({ file_path: "/tmp/chart.png", offset: 4, limit: 6 }, theme))
      .toBe("Read /tmp/chart.png · lines 4-9");
  });

  it("supports path aliases and omits absent or malformed range values", () => {
    expect(formatReadCall({ path: "chart.png" }, theme)).toBe("Read chart.png");
    expect(formatReadCall({ filename: "chart.png", offset: 0, limit: "4" }, theme)).toBe("Read chart.png");
    expect(formatReadCall({}, theme)).toBe("Read (path not provided)");
  });

  it("shows a successful image summary and preserves the returned caption", () => {
    const rows = readToolRenderer.renderResult({
      content: [
        { type: "image", mimeType: "image/png", data: "base64-payload" },
        { type: "text", text: "Image file: chart.png (image/png, 2.00 KB)" },
      ],
      details: {},
    }, {}, theme).render(80);
    expect(rows.join("\n")).toContain("✓ Read image");
    expect(rows.join("\n")).toContain("image/png image attached");
    expect(rows.join("\n")).toContain("chart.png");
    expect(rows.join("\n")).toContain("2.00 KB");
    expect(rows.join("\n")).not.toContain("base64-payload");
  });

  it("keeps the successful summary concise and exposes details when expanded", () => {
    const result = { content: [{ type: "image", mimeType: "image/jpeg", data: "secret-payload" }], details: { width: 640, height: 480 } };
    expect(readToolRenderer.renderResult(result, {}, theme).render(80).join("\n")).not.toContain("width");
    expect(readToolRenderer.renderResult(result, { expanded: true }, theme).render(80).join("\n"))
      .toContain('"width": 640');
  });

  it("marks thrown and returned read errors clearly", () => {
    const thrown = readToolRenderer.renderResult({ content: [{ type: "text", text: "Error executing Read: permission denied" }], isError: true }, {}, theme).render(80).join("\n");
    const returned = readToolRenderer.renderResult({ content: [{ type: "text", text: "ERROR: Failed to read image: no such file" }] }, {}, theme).render(80).join("\n");
    expect(thrown).toContain("✗ Read failed");
    expect(thrown).toContain("permission denied");
    expect(returned).toContain("✗ Read failed");
    expect(returned).toContain("no such file");
  });

  it("keeps rendering when expanded details cannot be serialized", () => {
    const circular: any = { self: undefined };
    circular.self = circular;
    const result = { content: [{ type: "image", mimeType: "image/png", data: "x" }], details: circular };
    const rows = readToolRenderer.renderResult(result, { expanded: true }, theme).render(80).join("\n");
    expect(rows).toContain("could not be serialized");
  });

  it("wraps long lines without splitting surrogate pairs", () => {
    const path = "/img/" + "🛰".repeat(10) + ".png";
    const rows = readToolRenderer.renderResult({ content: [{ type: "text", text: `ERROR: Failed to read image: ${path}` }] }, {}, theme)
      .render(20);
    for (const row of rows) expect(Array.from(row).length).toBeLessThanOrEqual(20);
    expect(rows.join("")).toContain("🛰".repeat(10));
  });
});
