/**
 * Render Oh My Pi tool cards by calling the REAL renderers from the vendored
 * tree. Run with bun from inside vendor/oh-my-pi so its workspace imports and
 * native deps resolve:
 *
 *   cd vendor/oh-my-pi && bun ../../tools/experiments/tool-card-capture/render-omp.ts
 *
 * Output: one JSON document on stdout, { id, width, lines } per capture.
 * Nothing here mutates the vendored tree.
 */
import { editToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/edit/renderer";
import { loadThemeSync } from "../../../vendor/oh-my-pi/packages/coding-agent/src/modes/theme/loader";
import { taskToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/task/renderer";
import { bashToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/tools/bash";
import { globToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/tools/glob";
import { grepToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/tools/grep";
import { readToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/tools/read";
import { todoToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/tools/todo";
import { webSearchToolRenderer } from "../../../vendor/oh-my-pi/packages/coding-agent/src/web/search/render";
import { type Fixture, fixtures, widths } from "./fixtures";

const theme = loadThemeSync("dark");

/**
 * Renderers are imported per module rather than through `tools/renderers.ts`:
 * that barrel transitively reaches the HTML exporter, which imports a build
 * artifact (`tool-views.generated.js`) absent from a plain source checkout.
 */
const renderers: Record<Fixture["family"], any> = {
  bash: bashToolRenderer,
  read: readToolRenderer,
  grep: grepToolRenderer,
  glob: globToolRenderer,
  edit: editToolRenderer,
  web_search: webSearchToolRenderer,
  task: taskToolRenderer,
  todo: todoToolRenderer,
};

/** Map the shared fixture onto the argument shape each OMP renderer expects. */
function ompArgs(fixture: Fixture): Record<string, unknown> {
  const args = fixture.args;
  switch (fixture.family) {
    case "read":
      return { path: args.file_path, offset: args.offset, limit: args.limit };
    case "bash":
      return { command: args.command, timeout: args.timeout_seconds };
    default:
      return args;
  }
}

function ompResult(fixture: Fixture) {
  return {
    content: fixture.text ? [{ type: "text", text: fixture.text }] : [],
    details: fixture.details,
    isError: fixture.isError,
  };
}

interface Capture {
  id: string;
  width: number;
  phase: "call" | "result";
  lines: string[];
  error?: string;
}

function renderComponent(component: any, width: number): string[] {
  const lines = component?.render?.(width);
  return Array.isArray(lines) ? lines : [];
}

const captures: Capture[] = [];

for (const fixture of fixtures) {
  const renderer = renderers[fixture.family];
  if (!renderer) continue;
  const args = ompArgs(fixture);
  const options = {
    expanded: fixture.state === "expanded",
    isPartial: fixture.state === "partial",
    isError: fixture.isError,
  };
  for (const width of widths) {
    if (fixture.state === "call") {
      try {
        captures.push({
          id: fixture.id,
          width,
          phase: "call",
          lines: renderComponent(renderer.renderCall?.(args, options, theme), width),
        });
      } catch (error) {
        captures.push({ id: fixture.id, width, phase: "call", lines: [], error: String(error) });
      }
      continue;
    }
    try {
      captures.push({
        id: fixture.id,
        width,
        phase: "result",
        lines: renderComponent(renderer.renderResult?.(ompResult(fixture), options, theme, args), width),
      });
    } catch (error) {
      captures.push({ id: fixture.id, width, phase: "result", lines: [], error: String(error) });
    }
  }
}

process.stdout.write(`${JSON.stringify({ side: "omp", captures }, null, 2)}\n`);
