/**
 * Shared fixtures that drive BOTH the Oh My Pi and the Pi-Swarm renderers.
 *
 * One fixture = one tool in one state. Each side's adapter maps the fixture to
 * whatever argument/result shape its own renderer expects, so a capture pair is
 * genuinely comparable: identical command, identical output, identical state.
 */

export type CardState = "call" | "success" | "error" | "partial" | "expanded";

export interface Fixture {
  /** Stable id used for artifact filenames. */
  id: string;
  /** Logical tool family, used to pick an adapter on each side. */
  family: "bash" | "read" | "grep" | "glob" | "edit" | "web_search" | "task" | "todo";
  state: CardState;
  /** Tool arguments as the model would send them. */
  args: Record<string, unknown>;
  /** Plain text the tool produced (stdout, file contents, match list…). */
  text: string;
  /** Structured details a rich renderer can use. */
  details?: Record<string, unknown>;
  isError?: boolean;
}

const BUILD_OUTPUT = [
  "> @pi-swarm/core@0.4.0 build",
  "> tsc -p tsconfig.json",
  "",
  "src/tool-renderer.ts:42:7 - error TS2322: Type 'string' is not assignable to type 'number'.",
  "",
  "42   const width: number = options.width;",
  "         ~~~~~",
  "",
  "Found 1 error in src/tool-renderer.ts:42",
].join("\n");

const LS_OUTPUT = Array.from({ length: 14 }, (_, i) => `packages/runtime/core/src/file-${i + 1}.ts`).join("\n");

const READ_SNIPPET = [
  "export function withDefaultToolRenderer<T extends Record<string, any>>(tool: T): T {",
  "  if (typeof tool.renderResult === \"function\") {",
  "    return {",
  "      ...tool,",
  "      renderResult(result: any, options: any, theme: any) {",
  "        return new CollapsibleToolOutputComponent(tool.renderResult(result, options, theme), Boolean(options?.expanded));",
  "      },",
  "    } as T;",
  "  }",
  "  return tool;",
  "}",
].join("\n");

const GREP_OUTPUT = [
  "packages/runtime/core/src/tool-renderer.ts",
  "  47: /** Adds only the missing renderer; tool-specific renderers remain authoritative. */",
  "  48: export function withDefaultToolRenderer<T extends Record<string, any>>(tool: T): T {",
  "",
  ".pi/lib/ui/bootstrap-tool-renderer.ts",
  "  92: export function formatBootstrapTool(details: BootstrapToolDetails | undefined): string {",
].join("\n");

export const fixtures: Fixture[] = [
  {
    id: "bash-call",
    family: "bash",
    state: "call",
    args: { command: "npm run build -w @pi-swarm/core", timeout_seconds: 120 },
    text: "",
  },
  {
    id: "bash-success",
    family: "bash",
    state: "success",
    args: { command: "ls packages/runtime/core/src", timeout_seconds: 60 },
    text: LS_OUTPUT,
    details: { exit_code: 0, duration_ms: 384, timed_out: false, command: "ls packages/runtime/core/src" },
  },
  {
    id: "bash-error",
    family: "bash",
    state: "error",
    args: { command: "npm run build -w @pi-swarm/core", timeout_seconds: 120 },
    text: `Error executing bash: Command exited with code 2\n${BUILD_OUTPUT}`,
    details: { exit_code: 2, duration_ms: 8123, timed_out: false, command: "npm run build -w @pi-swarm/core" },
    isError: true,
  },
  {
    id: "bash-expanded",
    family: "bash",
    state: "expanded",
    args: { command: "ls packages/runtime/core/src", timeout_seconds: 60 },
    text: LS_OUTPUT,
    details: { exit_code: 0, duration_ms: 384, timed_out: false, command: "ls packages/runtime/core/src" },
  },
  {
    id: "read-call",
    family: "read",
    state: "call",
    args: { file_path: "packages/runtime/core/src/tool-renderer.ts", offset: 47, limit: 11 },
    text: "",
  },
  {
    id: "read-success",
    family: "read",
    state: "success",
    args: { file_path: "packages/runtime/core/src/tool-renderer.ts", offset: 47, limit: 11 },
    text: READ_SNIPPET,
    details: { path: "packages/runtime/core/src/tool-renderer.ts", offset: 47, lines: 11, totalLines: 68 },
  },
  {
    id: "read-error",
    family: "read",
    state: "error",
    args: { file_path: "packages/runtime/core/src/missing.ts" },
    text: "Error executing Read: ENOENT: no such file or directory, open 'packages/runtime/core/src/missing.ts'",
    details: { error: "ENOENT: no such file or directory" },
    isError: true,
  },
  {
    id: "grep-call",
    family: "grep",
    state: "call",
    args: { pattern: "withDefaultToolRenderer", path: "packages" },
    text: "",
  },
  {
    id: "grep-success",
    family: "grep",
    state: "success",
    args: { pattern: "withDefaultToolRenderer", path: "packages" },
    text: GREP_OUTPUT,
    details: { matchCount: 3, fileCount: 2, displayContent: GREP_OUTPUT, searchPath: "packages", cwd: "." },
  },
  {
    id: "grep-empty",
    family: "grep",
    state: "success",
    args: { pattern: "nonexistent_symbol_xyz", path: "packages" },
    text: "No matches found",
    details: { matchCount: 0, fileCount: 0, displayContent: "", searchPath: "packages", cwd: "." },
  },
  {
    id: "glob-success",
    family: "glob",
    state: "success",
    args: { pattern: "packages/**/src/*.ts", limit: 100 },
    text: LS_OUTPUT,
    details: {
      fileCount: 14,
      files: LS_OUTPUT.split("\n"),
      scopePath: "packages",
      truncated: false,
    },
  },
  {
    id: "web-search-success",
    family: "web_search",
    state: "success",
    args: { query: "terminal tool card UI patterns" },
    text: "3 results for terminal tool card UI patterns",
    details: {
      query: "terminal tool card UI patterns",
      provider: "exa",
      results: [
        { title: "Designing rich CLI output", url: "https://example.com/cli-output", snippet: "Status lines and framed blocks keep tool output scannable." },
        { title: "Terminal UI component contracts", url: "https://example.com/tui-contract", snippet: "Each rendered array element is exactly one terminal row." },
        { title: "ANSI-safe truncation", url: "https://example.com/ansi-width", snippet: "Visible width must ignore escape sequences and count grapheme clusters." },
      ],
    },
  },
];

export const widths = [80, 120];
