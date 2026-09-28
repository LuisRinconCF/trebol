import { realpath, stat } from "node:fs/promises";
import { discoverHistoryFiles, readHistoryRecords, type HistoryBudget } from "../../lib/tools/history-reader.ts";
import { redactHistoryText, truncateUtf8 } from "../../lib/tools/history-matching.ts";
import { historyAdmission } from "../../lib/tools/history-admission.ts";
import { resolve, relative, sep, basename } from "node:path";
import { Text } from "@earendil-works/pi-tui";
import { withDefaultToolRenderer } from "../../../packages/runtime/core/src/tool-renderer.ts";

export const HISTORY_TOOL = "history_search";
const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_SCAN_LIMIT = 1000;
const DEFAULT_RESULT_LIMIT = 20;

type Role = "user" | "assistant" | "toolResult" | "bashExecution" | "custom" | "summary" | "any";
export interface HistoryOptions { signal?: AbortSignal; root?: string; maxBytes?: number; scanLimit?: number; includeCurrent?: boolean; currentSession?: string; }
export interface SearchOptions extends HistoryOptions { query: string; limit?: number; role?: Role; cwd?: string; since?: string; until?: string; includeToolResults?: boolean; }
export interface ReadOptions extends HistoryOptions { session: string; offset?: number; recordLimit?: number; maxCharacters?: number; }
export interface JsonSearchOptions { root?: string; query?: string; path?: string; limit?: number; maxBytes?: number; scanLimit?: number; includeValues?: boolean; }

function textOf(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (!value || typeof value !== "object") return "";
  return [value.text, value.content, value.display, value.summary, value.compactionSummary, value.branchSummary]
    .filter(x => x !== undefined).map(textOf).join(" ");
}
function roleOf(entry: any): Role {
  const type = entry?.type;
  if (type === "message") return entry.message?.role ?? "custom";
  if (type === "compaction" || type === "branch_summary") return "summary";
  if (type === "bash_execution") return "bashExecution";
  return "custom";
}
function cap(s: string, n: number) { return truncateUtf8(redactHistoryText(s), n); }
function inside(root: string, target: string): boolean { const r = relative(root, target); return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !r.startsWith("/")); }
async function safeRoot(input?: string): Promise<string> {
  const base = input ?? process.env.PI_CODING_AGENT_DIR ?? `${process.env.HOME ?? process.cwd()}/.pi/agent`;
  return realpath(input ? resolve(base) : resolve(base, "sessions"));
}
function boundedInteger(value: unknown, fallback: number, max: number, min = 1): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || (n as number) < min || (n as number) > max) throw new Error(`expected integer ${min}..${max}`);
  return n as number;
}
function makeBudget(options: HistoryOptions): HistoryBudget {
  return { maxTotalBytes: boundedInteger(options.maxBytes, 256 * 1024 * 1024, 256 * 1024 * 1024), maxFiles: boundedInteger(options.scanLimit, 10000, 10000), maxDirectoryEntries: 20000, maxDepth: 32, deadline: Date.now() + 30000, signal: options.signal };
}
function checked(budget: HistoryBudget) {
  budget.signal?.throwIfAborted();
  if (budget.partialReasons?.length) throw new Error(`History scan incomplete: ${[...new Set(budget.partialReasons)].join(", ")}; narrow the scope`);
}
function match(text: string, query: string) { const folded = text.toLowerCase(); return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every(q => folded.includes(q)); }

export class HistorySearchEngine {
  constructor(private readonly opts: HistoryOptions = {}) {}
  async list(input: HistoryOptions = {}) {
    const options = { ...this.opts, ...input }, budget = makeBudget(options), root = await safeRoot(options.root), result: any[] = [];
    for await (const file of discoverHistoryFiles(root, budget)) {
      if (!file.endsWith(".jsonl") || !options.includeCurrent && options.currentSession && resolve(options.currentSession) === file) continue;
      for await (const { value } of readHistoryRecords(file, budget)) {
        if (value.type === "session") {
          const info = await stat(file);
          result.push({ session: file, id: value.id, cwd: value.cwd, name: cap(String(value.name ?? ""), 512), updatedAt: info.mtime.toISOString(), bytes: info.size });
          result.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); if (result.length > 100) result.pop();
        }
        break;
      }
    }
    checked(budget); return result;
  }
  async search(input: SearchOptions) {
    const options = { ...this.opts, ...input }, budget = makeBudget(options), root = await safeRoot(options.root), hits: any[] = [];
    const limit = boundedInteger(options.limit, 20, 100);
    if (typeof options.query !== "string" || Buffer.byteLength(options.query) > 4096) throw new Error("query must be a string of at most 4096 bytes");
    const since = options.since ? Date.parse(options.since) : -Infinity, until = options.until ? Date.parse(options.until) : Infinity;
    if (Number.isNaN(since) || Number.isNaN(until)) throw new Error("invalid date filter");
    for await (const file of discoverHistoryFiles(root, budget)) {
      if (!file.endsWith(".jsonl") || !options.includeCurrent && options.currentSession && resolve(options.currentSession) === file) continue;
      let header: any;
      for await (const { value: entry } of readHistoryRecords(file, budget)) {
        if (!header) { if (entry.type !== "session") break; header = entry; if (options.cwd && header.cwd !== options.cwd) break; continue; }
        const role = roleOf(entry);
        if (options.role && options.role !== "any" && role !== options.role || !options.includeToolResults && ["toolResult", "bashExecution"].includes(role)) continue;
        const when = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : 0;
        if (when < since || when > until) continue;
        const text = redactHistoryText(textOf(entry.message ?? entry));
        if (!match(text, options.query)) continue;
        hits.push({ session: file, id: entry.id, parentId: entry.parentId, cwd: header.cwd, timestamp: entry.timestamp, role, snippet: cap(text, 500) });
        hits.sort((a,b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? ""))); if (hits.length > limit) hits.pop();
      }
    }
    checked(budget); return hits;
  }
  async read(input: ReadOptions) {
    const options = { ...this.opts, ...input }, budget = makeBudget(options), root = await safeRoot(options.root);
    const offset = boundedInteger(options.offset, 0, Number.MAX_SAFE_INTEGER, 0), limit = boundedInteger(options.recordLimit, 80, 200), max = boundedInteger(options.maxCharacters, 12000, 50000);
    if (typeof options.session !== "string" || !options.session) throw new Error("session is required");
    let file = resolve(options.session);
    if (!inside(root, file)) {
      const candidates: string[] = [];
      for await (const path of discoverHistoryFiles(root, budget)) if (path.endsWith(".jsonl") && (basename(path) === options.session || path.includes(options.session))) { candidates.push(path); if (candidates.length > 1) break; }
      checked(budget); if (candidates.length !== 1) throw new Error("session must be a unique path or id inside the sessions root"); file = candidates[0];
    }
    file = await realpath(file); if (!inside(root,file)) throw new Error("session resolves outside root");
    let count = 0, emitted = 0, transcript = "", more = false, truncated = false;
    for await (const { value } of readHistoryRecords(file,budget)) {
      if (value.type === "session") continue;
      if (count++ < offset) continue;
      if (emitted >= limit) { more = true; break; }
      const row = `${value.timestamp ?? ""} ${roleOf(value)} ${value.id ?? ""}\n${textOf(value.message ?? value)}\n\n`;
      const remaining = max - Buffer.byteLength(transcript), safe = cap(row, remaining);
      if (Buffer.byteLength(redactHistoryText(row)) > remaining && emitted > 0) { more = true; break; }
      transcript += safe; emitted++;
      if (Buffer.byteLength(redactHistoryText(row)) > remaining) { truncated = true; more = true; break; }
    }
    checked(budget); return { session: file, offset, recordLimit: emitted, nextOffset: more ? offset + emitted : null, transcript, ...(truncated ? { content_truncated: true } : {}) };
  }
  async jsonSearch(options: JsonSearchOptions & { signal?: AbortSignal }) {
    const budget = makeBudget(options), root = await safeRoot(options.root ?? process.cwd()), limit = boundedInteger(options.limit,50,500), result: any[] = [];
    const wanted = options.path?.split(".").filter(Boolean), query = options.query?.toLowerCase(); let scanned = 0, stopped = false;
    async function* candidates() { if ((await stat(root)).isFile()) yield root; else yield* discoverHistoryFiles(root,budget); }
    outer: for await (const file of candidates()) {
      if (!file.endsWith(".jsonl")) continue; scanned++;
      for await (const { value, line } of readHistoryRecords(file,budget)) {
        let selected: any = value; for (const key of wanted ?? []) selected = selected !== null && typeof selected === "object" && Object.hasOwn(selected,key) ? selected[key] : undefined;
        if (selected === undefined) continue;
        const text = redactHistoryText(JSON.stringify(selected)); if (query && !text.toLowerCase().includes(query)) continue;
        result.push({ file, line, path: options.path ?? "$", ...(options.includeValues ? { value: cap(text,4000) } : {}) });
        if (result.length >= limit) { stopped = true; break outer; }
      }
    }
    checked(budget); return { matches: result, scanned, complete: !stopped, ...(stopped ? { truncated: true } : {}) };
  }
}

const schema = { type: "object", required: ["operation"], additionalProperties: false, properties: { operation: { type: "string", enum: ["list", "search", "read", "json_search"] }, query: { type: "string" }, session: { type: "string" }, role: { type: "string" }, cwd: { type: "string" }, since: { type: "string" }, until: { type: "string" }, root: { type: "string" }, path: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, recordLimit: { type: "number" }, maxCharacters: { type: "number" }, maxBytes: { type: "number" }, includeValues: { type: "boolean" }, includeToolResults: { type: "boolean" }, includeCurrent: { type: "boolean" }, scanLimit: { type: "number" } } };

function pretty(details: any, theme: any, expanded = false): string {
  const fg = (name: string, value: string) => theme?.fg ? theme.fg(name, value) : value;
  const op = details?.matches ? "JSON DATA" : details?.transcript !== undefined ? "TRANSCRIPT" : Array.isArray(details) && details[0]?.session ? "HISTORY" : "HISTORY";
  const rows: string[] = [fg("accent", "+----------------------------------------------------------+"), fg("accent", `| ${op.padEnd(56).slice(0, 56)} |`), fg("muted", "+----------------------------------------------------------+")];
  if (details?.transcript !== undefined) {
    rows.push(fg("dim", `| page ${details.offset ?? 0} | ${details.recordLimit ?? 0} records${details.nextOffset !== null ? " | more available" : ""}`));
    if (expanded || details.transcript.length < 1800) rows.push(...String(details.transcript).split("\n").slice(0, expanded ? 80 : 24).map((x: string) => `  ${x}`));
    else rows.push(fg("dim", "| ... transcript hidden (expand to inspect)"));
  } else if (Array.isArray(details)) {
    rows.push(fg("dim", `| ${details.length} result${details.length === 1 ? "" : "s"}`));
    for (const item of details.slice(0, expanded ? 30 : 8)) {
      const title = item.name || item.id || item.session?.split(/[\\/]/).pop() || "session";
      rows.push(`| ${fg("success", "+")} ${fg("text", String(title).slice(0, 70))}`);
      if (item.snippet) rows.push(fg("dim", `|   ${String(item.snippet).replace(/\s+/g, " ").slice(0, expanded ? 176 : 106)}`));
      else if (item.cwd) rows.push(fg("dim", `|   ${item.cwd}`));
    }
    if (details.length > (expanded ? 30 : 8)) rows.push(fg("dim", `| ... ${details.length - (expanded ? 30 : 8)} more`));
  } else if (details?.matches) {
    rows.push(fg("dim", `| ${details.matches.length} match${details.matches.length === 1 ? "" : "es"} | ${details.scanned ?? 0} files scanned`));
    for (const item of details.matches.slice(0, expanded ? 30 : 10)) rows.push(`| ${fg("success", "+")} ${item.file}:${item.line}  ${fg("dim", item.path ?? "$")}${item.value ? `\\n|   ${item.value}` : ""}`);
  }
  rows.push(fg("muted", "+----------------------------------------------------------+"));
  return rows.join("\n");
}

export default function historySearchExtension(pi: any) { let engine = new HistorySearchEngine(); pi.on?.("session_start", (_e: any, ctx: any) => { const root = ctx?.sessionManager?.getSessionDir?.(); engine = new HistorySearchEngine({ root, currentSession: ctx?.sessionManager?.getSessionFile?.() }); }); pi.registerTool?.(withDefaultToolRenderer({ name: HISTORY_TOOL, label: "History Search", description: "Search prior Pi conversations and stream-search huge JSONL datasets. Read-only, bounded, and redacted. Search first, then read a matching session.", parameters: schema, renderCall(args: any, theme: any) { return new Text(fgCall(args, theme), 0, 0); }, renderResult(result: any, options: any, theme: any) { const value = result?.details; const output = pretty(value, theme, Boolean(options?.expanded)); return new Text(output, 0, 0); }, execute: async (_id: string, params: any, signal?: AbortSignal) => { try { return await historyAdmission.run(signal, async () => { const p = { ...params, signal }; const result = p.operation === "list" ? await engine.list(p) : p.operation === "read" ? await engine.read(p) : p.operation === "json_search" ? await engine.jsonSearch(p) : await engine.search(p); return { content: [{ type: "text", text: JSON.stringify(result) }], details: result }; }); } catch (e) { return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true, details: {} }; } } })); }
function fgCall(args: any, theme: any) { const fg = (name: string, value: string) => theme?.fg ? theme.fg(name, value) : value; return fg("accent", "+-- HISTORY SEARCH ----------------------------------------+") + "\n" + fg("dim", `| op: ${(args?.operation ?? "search").padEnd(12)} | ${args?.query ? `query: ${String(args.query).slice(0, 35)}` : "read-only / local / bounded"}`) + "\n" + fg("accent", "+----------------------------------------------------------+"); }
