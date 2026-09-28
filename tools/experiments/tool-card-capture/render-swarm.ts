/**
 * Render Pi-Swarm tool cards by calling the REAL renderers this repo ships,
 * against the same fixtures used for the Oh My Pi capture.
 *
 *   npx tsx tools/experiments/tool-card-capture/render-swarm.ts
 *
 * Tools with a dedicated renderer (bash) use it. Every other family is routed
 * through `withDefaultToolRenderer`, which is what those tools actually get
 * today — that is precisely the comparison the audit needs.
 */
import { bashCallComponent, bashResultComponent, formatBashCall } from "../../../.pi/lib/tools/swarm-bash.ts";
import { withDefaultToolRenderer } from "../../../packages/runtime/core/src/tool-renderer.ts";
import { type Fixture, fixtures, widths } from "./fixtures.ts";

/** Minimal theme with the same colour hooks Pi passes to extension renderers. */
const ANSI: Record<string, string> = {
  toolTitle: "\u001b[38;2;254;188;56m",
  toolOutput: "\u001b[38;2;119;125;136m",
  muted: "\u001b[38;2;95;102;115m",
  error: "\u001b[38;2;255;85;85m",
  accent: "\u001b[38;2;139;233;253m",
  success: "\u001b[38;2;80;250;123m",
};
const theme = {
  fg: (color: string, text: string) => `${ANSI[color] ?? ""}${text}\u001b[39m`,
  bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
};

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, "");

/** Pi's Text component wraps on visible width; mirror that for the fallback. */
const wrap = (text: string, width: number): string[] => {
  if (width <= 0) return [""];
  const rows: string[] = [];
  for (const line of text.split("\n")) {
    if (stripAnsi(line).length <= width) { rows.push(line); continue; }
    for (let i = 0; i < line.length; i += width) rows.push(line.slice(i, i + width));
  }
  return rows;
};

interface Capture { id: string; width: number; phase: "call" | "result"; lines: string[]; renderer: string; error?: string }

const swarmResult = (fixture: Fixture) => ({
  content: fixture.text ? [{ type: "text", text: fixture.text }] : [],
  details: fixture.details,
  isError: fixture.isError,
});

/** The generic fallback every non-bash family currently lands on. */
const fallback = withDefaultToolRenderer({ name: "generic" } as any) as any;

const captures: Capture[] = [];

for (const fixture of fixtures) {
  const options = {
    expanded: fixture.state === "expanded",
    isPartial: fixture.state === "partial",
    isError: fixture.isError,
  };
  const dedicated = fixture.family === "bash";
  for (const width of widths) {
    try {
      if (fixture.state === "call") {
        // Only bash has a call renderer; the generic adapter adds none, so a
        // call card simply does not exist for the other families.
        const lines = dedicated
          ? bashCallComponent(formatBashCall(fixture.args as any, theme), undefined).render(width)
          : [];
        captures.push({ id: fixture.id, width, phase: "call", lines, renderer: dedicated ? "swarm-bash" : "none" });
        continue;
      }
      const component = dedicated
        ? bashResultComponent(swarmResult(fixture), options, theme, wrap)
        : fallback.renderResult(swarmResult(fixture), options, theme);
      captures.push({
        id: fixture.id,
        width,
        phase: "result",
        lines: component.render(width),
        renderer: dedicated ? "swarm-bash" : "withDefaultToolRenderer",
      });
    } catch (error) {
      captures.push({ id: fixture.id, width, phase: fixture.state === "call" ? "call" : "result", lines: [], renderer: "error", error: String(error) });
    }
  }
}

process.stdout.write(`${JSON.stringify({ side: "swarm", captures }, null, 2)}\n`);
