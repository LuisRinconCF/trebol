/**
 * Swarm-compatible HistorySearch/HistoryGet over Pi session JSONL.
 *
 * Pi does not persist Swarm's conversation origin or separately generated
 * preview fields. Origin is therefore omitted; preview/title are derived from
 * the first substantive user message. Conversation IDs are Pi session IDs.
 */
import { existsSync } from "node:fs";
import { dirname, isAbsolute, parse, resolve } from "node:path";

import { discoverHistoryFiles, readHistoryRecords, type HistoryBudget } from "./history-reader.ts";
import { compileHistoryRegex, redactHistoryText, boundedHistorySnippet, truncateUtf8 } from "./history-matching.ts";

export interface HistoryRuntime { root: string; cwd: string; signal?: AbortSignal }
type AnyMap = Record<string, any>;
type Segment = { kind: "message" | "tool_call" | "tool_result"; text: string; messageId?: string; role?: string; toolName?: string; failed?: boolean; ordinal: number };
type Session = { id: string; cwd: string; title: string; titlePersisted: boolean; preview: string; updatedAt: string; entries: AnyMap[]; messages: AnyMap[]; body: string; segments: Segment[] };

const runtimeBlock = /<system-reminder[^>]*>[\s\S]*?<\/system-reminder>|<swarm_runtime_guidance[^>]*>[\s\S]*?<\/swarm_runtime_guidance>|<available_skills[^>]*>[\s\S]*?<\/available_skills>|<swarm_runtime_(?:skills|capabilities)[^>]*>[\s\S]*?<\/swarm_runtime_(?:skills|capabilities)>|<effective_capabilities[^>]*>[\s\S]*?<\/effective_capabilities>|<env[^>]*>[\s\S]*?<\/env>/gi;
const runtimePrefixes = ["[scheduled]", "## mcp context", "## current tasks", "**current mode**", "[task nudge]", "[skill reminder]", "this session is being continued from a previous conversation", "please continue the conversation from where we left off", "continue from where"];

function textOf(value: any): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((x) => textOf(x)).filter(Boolean).join("\n");
  if (!value || typeof value !== "object") return "";
  return textOf(value.text ?? value.content ?? value.output ?? "");
}
export function cleanHistoryText(value: string): string {
  let out = value.replace(/\\u003c/gi, "<").replace(/\\u003e/gi, ">").replace(/\\"/g, "\"").replace(runtimeBlock, " ");
  const opening = /<(?:system-reminder|swarm_runtime_guidance|available_skills|swarm_runtime_(?:skills|capabilities)|effective_capabilities|env)\b/i.exec(out);
  if (opening) out = out.slice(0, opening.index);
  out = out.replace(/^\s*\[(?:SKILL REMINDER|Task Nudge)\].*$/gim, " ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  return out;
}
/** historytools.isSubstantiveUserText over CleanText'd input (cleaning is idempotent). */
export const isSubstantiveUserText = (cleaned: string): boolean => substantive(cleaned);
function substantive(value: string): boolean {
  const lower = cleanHistoryText(value).toLowerCase().trim();
  return lower !== "" && lower !== "continue" && !(lower.includes("continue") && lower.split(/\s+/).length <= 6) && !runtimePrefixes.some((p) => lower.startsWith(p));
}
function redact(value: string): string { return redactHistoryText(value); }
function deriveTitle(value: string): string {
  const clean = cleanHistoryText(value);
  if (!clean) return "(untitled conversation)";
  const stop = clean.search(/[.!?\n]/);
  const candidate = stop > 0 && stop < 80 ? clean.slice(0, stop) : clean;
  if ([...candidate].length <= 80) return candidate.trim();
  const first = [...candidate].slice(0, 80).join(""); const space = first.lastIndexOf(" ");
  return (space > 40 ? first.slice(0, space) : first).trim() + "…";
}
function canonicalWorkspace(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "" || !isAbsolute(value) || parse(resolve(value)).root === resolve(value)) throw new Error(`${label} must be an absolute non-root path`);
  return resolve(value);
}
function integer(p: AnyMap, name: string, fallback: number, max: number, allowZero = false): number {
  const value = p[name]; if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > max) {
    if (allowZero) throw new Error(`${name} must be a non-negative integer`);
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}
function bool(p: AnyMap, name: string, fallback: boolean): boolean {
  if (p[name] === undefined || p[name] === null) return fallback;
  if (typeof p[name] !== "boolean") throw new Error(`${name} must be a boolean`);
  return p[name];
}
function iso(value: string): string { const d = new Date(value); return Number.isNaN(d.valueOf()) ? "" : d.toISOString().replace(".000Z", "Z"); }
function compactTitle(value: string): string { return deriveTitle(value); }

/**
 * Providers sometimes materialize optional JSON-Schema defaults and empty
 * strings. Remove only values that are semantically identical to omission so
 * they cannot accidentally select segment/stats mode or invalidate a normal
 * workspace search.
 */
export function normalizeHistorySearchParams(input: AnyMap): AnyMap {
  const params = { ...(input ?? {}) };
  for (const key of ["workspace_path", "regex", "tool_name"] as const) {
    if (typeof params[key] === "string" && params[key].trim() === "") delete params[key];
  }
  if (Array.isArray(params.fields) && params.fields.length === 0) delete params.fields;
  if (params.tool_outcome === "any" || params.tool_outcome === "") delete params.tool_outcome;
  if (params.stats !== true) {
    delete params.ngram;
    delete params.top_terms;
    if (params.stats === false) delete params.stats;
  }
  return params;
}

/**
 * Preserve explicit pagination while tolerating neutral values materialized by
 * schema adapters. offset:0 is only redundant when tail already selects the
 * window; on its own it still means "start at the first stored message".
 */
export function normalizeHistoryGetParams(input: AnyMap): AnyMap {
  const params = { ...(input ?? {}) };
  if (typeof params.workspace_path === "string" && params.workspace_path.trim() === "")
    delete params.workspace_path;
  if (params.tail !== undefined && params.offset === 0) delete params.offset;
  return params;
}

function convertMessage(entry: AnyMap): AnyMap | undefined {
  if (entry?.type !== "message" || !entry.message) return;
  const role = entry.message.role ?? "custom";
  const blocks = Array.isArray(entry.message.content) ? entry.message.content : [{ type: "text", text: textOf(entry.message.content) }];
  const content = blocks.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
  const row: AnyMap = { id: typeof entry.id === "string" ? entry.id : "", timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "", role, content };
  const calls = blocks.filter((b: any) => b?.type === "toolCall" || b?.type === "tool_call").map((b: any) => ({ id: b.id ?? b.toolCallId ?? "", name: b.name ?? b.toolName ?? "", parameters: b.arguments ?? b.input ?? {} }));
  if (calls.length) row.tool_calls = calls;
  if (role === "toolResult" || role === "tool") row.tool_results = [{ call_id: entry.message.toolCallId ?? "", name: entry.message.toolName ?? "", output: textOf(entry.message.content), ...(entry.message.isError ? { error: { type: "tool_error", message: textOf(entry.message.content) } } : {}) }];
  return row;
}

/** Ordinary search scans records without materializing message/session arrays. */
async function streamOrdinarySearch(runtime: HistoryRuntime, workspace: string, visit: (session: { id: string; cwd: string; title: string; titlePersisted: boolean; preview: string; updatedAt: string; messageCount: number; bodyTexts: string[]; bodyFound: boolean[]; regexFound: boolean }) => void, bodyQuery: { enabled: boolean; terms: string[]; regex?: RegExp; caseSensitive: boolean; excludeRuntime: boolean }): Promise<HistoryBudget> {
  const budget: HistoryBudget = { projection: "prose", maxTotalBytes: 256 * 1024 * 1024, maxFiles: 10000, maxDirectoryEntries: 20000, maxDepth: 32, deadline: Date.now() + 30000, signal: runtime.signal };
  if (!existsSync(runtime.root)) return budget;
  for await (const file of discoverHistoryFiles(runtime.root, budget)) {
    if (!file.endsWith(".jsonl")) continue;
    let header: AnyMap | undefined, skipped = false, updated = "", messageCount = 0, firstUser = "";
    const bodyTexts: string[] = [], found = bodyQuery.terms.map(() => false); let regexFound = false;
    for await (const { value: entry } of readHistoryRecords(file, budget)) {
      runtime.signal?.throwIfAborted();
      if (!header) {
        if (entry.type !== "session" || typeof entry.cwd !== "string" || !isAbsolute(entry.cwd)) { const reasons = budget.partialReasons ??= []; if (!reasons.includes("invalid_header")) reasons.push("invalid_header"); skipped = true; break; }
        header = entry;
        if (workspace && resolve(header.cwd) !== workspace) { skipped = true; break; }
      }
      if (typeof entry.timestamp === "string") updated = entry.timestamp;
      if (entry.type === "session_info") { header.name = typeof entry.name === "string" ? entry.name : ""; continue; }
      const message = convertMessage(entry); if (!message) continue;
      messageCount++;
      const rawText = String(message.content ?? "");
      const text = redact(bodyQuery.excludeRuntime ? (substantive(rawText) ? cleanHistoryText(rawText) : "") : rawText);
      // Keep bounded first/last message samples; matching is accumulated while
      // streaming below via the callback's precomputed query predicate.
      if (bodyQuery.enabled && text && ["user", "assistant"].includes(message.role)) {
        const folded = bodyQuery.caseSensitive ? text : text.toLowerCase();
        bodyQuery.terms.forEach((term, i) => { if (folded.includes(bodyQuery.caseSensitive ? term : term.toLowerCase())) found[i] = true; });
        if (bodyQuery.regex) { bodyQuery.regex.lastIndex = 0; regexFound ||= bodyQuery.regex.test(text); }
        if ((regexFound || bodyQuery.terms.some((term) => folded.includes(bodyQuery.caseSensitive ? term : term.toLowerCase()))) && bodyTexts.reduce((n, t) => n + t.length, 0) < 4096) bodyTexts.push(text.slice(0, 2048));
      }
      if (!firstUser && message.role === "user" && substantive(text)) firstUser = text.slice(0, 4096);
    }
    if (!header || skipped) continue;
    const preview = cleanHistoryText(firstUser), persisted = cleanHistoryText(typeof header.name === "string" ? header.name : "").slice(0, 4096);
    visit({ id: String(header.id ?? file).slice(0, 256), cwd: header.cwd, title: redact(persisted || deriveTitle(preview)), titlePersisted: Boolean(persisted), preview, updatedAt: iso(updated), messageCount, bodyTexts, bodyFound: found, regexFound });
  }
  runtime.signal?.throwIfAborted(); return budget;
}

async function loadSessionForGet(file: string, id: string, maxMessages: number, budget: HistoryBudget, maxChars: number, offset?: number, tail?: number): Promise<Session> {
  const selected: AnyMap[] = [];
  let header: AnyMap = {}, messageCount = 0, clipped = false;
  const limit = Math.min(tail ?? maxMessages, maxMessages);
  for await (const { value: entry } of readHistoryRecords(file, budget)) {
    budget.signal?.throwIfAborted();
    if (entry.type === "session") { header = entry; continue; }
    if (entry.type === "session_info") { header.name = typeof entry.name === "string" ? entry.name : ""; continue; }
    const message = convertMessage(entry);
    if (!message) continue;
    const index = messageCount++;
    if (offset !== undefined && (index < offset || index >= offset + maxMessages)) continue;
    const fitted = fitRow(message, maxChars, false);
    clipped ||= fitted.truncated;
    selected.push(fitted.row ?? { id: message.id, timestamp: message.timestamp, role: message.role, content: "" });
    if (offset === undefined && selected.length > limit) selected.shift();
  }
  const preview = boundedHistorySnippet(cleanHistoryText(selected.find(m => m.role === "user" && substantive(m.content))?.content ?? ""), 512);
  const title = boundedHistorySnippet(cleanHistoryText(typeof header.name === "string" ? header.name : ""), 512);
  return { id: header.id ?? id, cwd: header.cwd ?? "", title: title || deriveTitle(preview), titlePersisted: Boolean(title), preview,
    updatedAt: iso(header.timestamp ?? ""), entries: [], messages: selected, body: "", segments: [], _messageCount: messageCount, _clipped: clipped } as Session;
}

function regexFor(params: AnyMap): RegExp | undefined {
  if (params.regex === undefined || params.regex === null || params.regex === "") return;
  if (typeof params.regex !== "string") throw new Error("regex must be a string");
  if (/(\(\?[=!<]|\\[1-9])/.test(params.regex)) throw new Error(`invalid regex ${JSON.stringify(params.regex)}: invalid or unsupported Perl syntax (Go RE2 syntax; lookahead/backreferences are unsupported — use a plain query instead)`);
  try { return compileHistoryRegex(params.regex, Boolean(params.case_sensitive)) as RegExp; }
  catch (e) { throw new Error(`invalid regex ${JSON.stringify(params.regex)}: ${e instanceof Error ? e.message : String(e)} (Go RE2 syntax; lookahead/backreferences are unsupported — use a plain query instead)`); }
}
function snippet(text: string, matcher: RegExp | undefined, terms: string[], context: number): string {
  let at = -1, length = 0;
  if (matcher) { const m = matcher.exec(text); if (m) { at = m.index; length = m[0].length; } matcher.lastIndex = 0; }
  if (at < 0) for (const term of terms) { at = text.toLowerCase().indexOf(term.toLowerCase()); if (at >= 0) { length = term.length; break; } }
  if (at < 0) return [...text].slice(0, Math.min(320, context * 2)).join("");
  const chars = [...text], before = [...text.slice(0, at)].length, matchLen = [...text.slice(at, at + length)].length;
  const start = Math.max(0, before - context), end = Math.min(chars.length, before + matchLen + context);
  return (start ? "…" : "") + chars.slice(start, end).join("") + (end < chars.length ? "…" : "");
}

export async function historySearch(params: AnyMap, runtime: HistoryRuntime): Promise<AnyMap> {
  params = normalizeHistorySearchParams(params);
  for (const name of ["snippet", "exclude_runtime", "stats"]) bool(params, name, false);
  for (const name of ["query", "tool_name", "regex", "workspace_path"]) if (params[name] !== undefined && (typeof params[name] !== "string" || Buffer.byteLength(params[name]) > 4096)) throw new Error(`${name} must be a string of at most 4096 bytes`);
  if (params.segment_kind !== undefined && !["message", "tool_call", "tool_result"].includes(params.segment_kind)) throw new Error("invalid segment_kind");
  if (params.tool_outcome !== undefined && !["failed", "succeeded"].includes(params.tool_outcome)) throw new Error("invalid tool_outcome");
  if ((params.tool_name || params.segment_kind || params.tool_outcome || params.stats) && (params.fields || params.search_body === false)) throw new Error("fields/search_body cannot be combined with segment or stats mode");
  const cwd = canonicalWorkspace(runtime.cwd, "workspace path");
  const scope = params.scope ?? "current";
  if (scope !== "current" && scope !== "all") throw new Error("HistorySearch: scope must be one of current or all");
  const requestedWorkspace = typeof params.workspace_path === "string" && params.workspace_path.trim() !== "" ? params.workspace_path : undefined;
  if (requestedWorkspace !== undefined && scope === "all") throw new Error("HistorySearch: workspace_path and scope=all are mutually exclusive");
  const workspace = scope === "all" ? "" : requestedWorkspace !== undefined ? canonicalWorkspace(requestedWorkspace, "workspace_path") : cwd;
  const limit = integer(params, "limit", 10, 50);
  const caseSensitive = bool(params, "case_sensitive", false);
  const searchBody = bool(params, "search_body", String(params.query ?? "").trim() !== "" || Boolean(params.regex));
  const query = typeof params.query === "string" ? params.query.trim() : "";
  const terms = query.split(/\s+/).filter(Boolean);
  const rx = regexFor({ ...params, case_sensitive: caseSensitive });
  if (params.fields !== undefined && !Array.isArray(params.fields)) throw new Error("HistorySearch: fields must be an array of title, preview or body");
  const snippetContext = integer(params, "snippet_context", 60, 200);
  const maxSnippets = integer(params, "max_snippets", 3, 10);
  const fields: string[] = (params.fields ?? ["title", "preview", "body"]).map((f: unknown) => String(f).toLowerCase().trim());
  for (const f of fields) if (!["title", "preview", "body"].includes(String(f).toLowerCase().trim())) throw new Error(`HistorySearch: fields must contain only title, preview or body (got ${JSON.stringify(f)})`);
  const sortBy = params.sort ?? ((query || rx) ? "relevance" : "recency");
  if (!["relevance", "recency", "message_count"].includes(sortBy)) throw new Error("HistorySearch: sort must be one of relevance, recency, message_count");
  const order = params.order ?? "desc"; if (!["asc", "desc"].includes(order)) throw new Error("HistorySearch: order must be one of asc, desc");
  const minMessages = integer(params, "min_messages", 0, Number.MAX_SAFE_INTEGER, true);
  const budget: HistoryBudget = { maxTotalBytes: 256 * 1024 * 1024, maxFiles: 10000, maxDirectoryEntries: 20000, maxDepth: 32, deadline: Date.now() + 30000, signal: runtime.signal };
  const segmentRequested = ["tool_name", "tool_outcome", "segment_kind"].some((k) => params[k] !== undefined) || params.stats === true;
  if (segmentRequested) return boundSearchResponse(await streamingSegments(params, runtime, workspace, scope));
  const ranked: { session: { id: string; cwd: string; title: string; titlePersisted: boolean; preview: string; updatedAt: string; messageCount: number }; score: number; snippets: AnyMap[] }[] = [];
  const better = (a: typeof ranked[number], b: typeof ranked[number]) => {
    const n = sortBy === "message_count" ? a.session.messageCount - b.session.messageCount : sortBy === "recency" ? a.session.updatedAt.localeCompare(b.session.updatedAt) : a.score - b.score || a.session.updatedAt.localeCompare(b.session.updatedAt);
    return order === "desc" ? -n : n;
  };
  let candidatesExamined = 0, matchingCandidates = 0;
  const scanned = await streamOrdinarySearch(runtime, workspace, (s) => {
    if (s.messageCount < minMessages) return;
    candidatesExamined++;
    const values: AnyMap = { title: redact(s.title), preview: redact(s.preview), body: searchBody ? s.bodyTexts.join("\n") : "" };
    if (params.exclude_runtime) values.body = cleanHistoryText(values.body);
    let score = 0, ok = true;
    for (const [termIndex, term] of terms.entries()) {
      const needle = caseSensitive ? term : term.toLowerCase();
      const title = caseSensitive ? values.title : values.title.toLowerCase();
      const hay = fields.map((f) => caseSensitive ? values[f] : values[f].toLowerCase());
      if (!hay.some((v) => v.includes(needle)) && !(searchBody && fields.includes("body") && s.bodyFound[termIndex])) { ok = false; break; }
      score += s.titlePersisted && title.includes(needle) ? 3 : 1;
    }
    if (ok && rx && !(searchBody && fields.includes("body") && s.regexFound) && !fields.some((f) => { rx.lastIndex = 0; return rx.test(values[f]); })) ok = false;
    if (!ok) return;
    matchingCandidates++;
    const snippets: AnyMap[] = [];
    if (params.snippet) for (const f of fields) {
      const v = values[f]; if (!v) continue;
      const matches = rx ? (rx.lastIndex = 0, rx.test(v)) : terms.some((t) => (caseSensitive ? v : v.toLowerCase()).includes(caseSensitive ? t : t.toLowerCase()));
      if (matches) snippets.push({ field: f, text: boundedHistorySnippet(snippet(v, rx, terms, snippetContext), 2048) });
      if (snippets.length >= maxSnippets) break;
    }
    const { bodyTexts: _discard, bodyFound: _found, regexFound: _regex, ...metadata } = s;
    ranked.push({ session: metadata, score, snippets });
    ranked.sort(better);
    if (ranked.length > limit) ranked.pop();
  }, { enabled: searchBody && fields.includes("body"), terms, regex: rx, caseSensitive, excludeRuntime: Boolean(params.exclude_runtime) });
  const coverage = { complete: !scanned.partialReasons?.length, scan: scanned.counters, ...(scanned.partialReasons?.length ? { partial_reasons: scanned.partialReasons } : {}) };
  const truncated = matchingCandidates > ranked.length;
  const results = ranked.slice(0, limit).map(({ session: s, snippets }) => ({
    id: s.id, title: boundedHistorySnippet(s.title, 512), ...(s.preview && s.preview !== s.title ? { preview: boundedHistorySnippet(s.preview, 512) } : {}), ...(s.messageCount ? { message_count: s.messageCount } : {}),
    ...(s.updatedAt ? { updated_at: s.updatedAt } : {}), ...(scope === "all" ? { workspace_path: s.cwd } : {}), ...(snippets.length ? { snippets } : {}),
  }));
  return boundSearchResponse({ ...coverage, scope, query: caseSensitive ? query : query.toLowerCase(), sort: sortBy, order, results, ...(workspace ? { workspace_path: workspace } : {}), ...(truncated ? { truncated: true } : {}), ...((rx || caseSensitive || params.fields || params.exclude_runtime) ? { post_filtered: true, candidates_examined: candidatesExamined } : {}) });
}

async function streamingSegments(params: AnyMap, runtime: HistoryRuntime, workspace: string, scope: string): Promise<AnyMap> {
  const budget: HistoryBudget = { maxTotalBytes: 256 * 1024 * 1024, maxFiles: 10000, maxDirectoryEntries: 20000, maxDepth: 32, deadline: Date.now() + 30000, signal: runtime.signal };
  const limit = integer(params, "limit", 10, 50), ngram = integer(params, "ngram", 1, 5), top = integer(params, "top_terms", 50, 500);
  const min = integer(params, "min_messages", 0, Number.MAX_SAFE_INTEGER, true);
  const query = String(params.query ?? "").trim(), fold = (x: string) => params.case_sensitive ? x : x.toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean).map(fold), rx = regexFor(params);
  const sort = params.sort ?? (query || rx ? "relevance" : "recency"), order = params.order ?? "desc";
  const rows: AnyMap[] = [], counts = new Map<string, { occurrences: number; segments: number; conversations: number; lastSegment: number; lastConversation: number }>();
  let segmentNumber = 0, conversationNumber = 0, matched = 0, vocabularyBytes = 0;
  const compare = (a: AnyMap, b: AnyMap) => {
    const delta = sort === "message_count" ? a.message_count - b.message_count : sort === "recency" ? a.updated_at.localeCompare(b.updated_at) : a._score - b._score || a.updated_at.localeCompare(b.updated_at);
    return (order === "asc" ? delta : -delta) || a.id.localeCompare(b.id);
  };
  if (existsSync(runtime.root)) files: for await (const file of discoverHistoryFiles(runtime.root, budget)) {
    if (!file.endsWith(".jsonl")) continue;
    let header: AnyMap | undefined, count = 0, preview = "", title = "", updated = "", best: AnyMap | undefined, ordinal = 0, skipped = false;
    conversationNumber++;
    // Count threshold before stats aggregation without retaining messages.
    if (params.stats && min > 0) {
      let probeHeader = false, probeCount = 0;
      for await (const { value } of readHistoryRecords(file, budget)) {
        if (!probeHeader) { if (value.type !== "session" || typeof value.cwd !== "string" || !isAbsolute(value.cwd) || workspace && resolve(value.cwd) !== workspace) break; probeHeader = true; }
        if (value.type === "message") probeCount++;
        if (probeCount >= min) break;
      }
      if (probeCount < min) continue;
    }
    for await (const { value: entry } of readHistoryRecords(file, budget)) {
      runtime.signal?.throwIfAborted();
      if (!header) {
        if (entry.type !== "session" || typeof entry.cwd !== "string" || !isAbsolute(entry.cwd)) { (budget.partialReasons ??= []).push("invalid_header"); skipped = true; break; }
        header = entry;
        if (workspace && resolve(header.cwd) !== workspace) { skipped = true; break; }
        title = boundedHistorySnippet(typeof header.name === "string" ? header.name : "", 512);
      }
      if (typeof entry.timestamp === "string") updated = iso(entry.timestamp);
      if (entry.type === "session_info") { title = boundedHistorySnippet(typeof entry.name === "string" ? entry.name : "", 512); continue; }
      const message = convertMessage(entry); if (!message) continue;
      count++;
      if (!preview && message.role === "user" && substantive(message.content)) preview = boundedHistorySnippet(cleanHistoryText(message.content), 512);
      const segments: Segment[] = [];
      if (["user", "assistant"].includes(message.role) && message.content) segments.push({ kind: "message", text: message.content, messageId: message.id, role: message.role, ordinal: ordinal++ });
      for (const c of message.tool_calls ?? []) segments.push({ kind: "tool_call", text: JSON.stringify(sanitize(c.parameters)), messageId: message.id, role: message.role, toolName: c.name, ordinal: ordinal++ });
      for (const r of message.tool_results ?? []) segments.push({ kind: "tool_result", text: r.output, messageId: message.id, role: message.role, toolName: r.name, failed: Boolean(r.error), ordinal: ordinal++ });
      for (const segment of segments) {
        if (params.tool_name && segment.toolName !== params.tool_name.trim() || params.segment_kind && segment.kind !== params.segment_kind) continue;
        if (params.tool_outcome && (segment.kind !== "tool_result" || Boolean(segment.failed) !== (params.tool_outcome === "failed"))) continue;
        const text = redact(params.exclude_runtime ? cleanHistoryText(segment.text) : segment.text);
        if (params.exclude_runtime && !substantive(text)) continue;
        if (!terms.every(term => fold(text).includes(term)) || rx && !rx.test(text)) continue;
        segmentNumber++;
        if (!best) best = { kind: segment.kind, ordinal: segment.ordinal, text: boundedHistorySnippet(snippet(text, rx, terms, 60), 512), message_id: segment.messageId, role: segment.role,
          ...(segment.toolName ? { tool_name: segment.toolName } : {}), ...(segment.kind === "tool_result" ? { outcome: segment.failed ? "failed" : "succeeded" } : {}) };
        if (!params.stats) continue;
        const window: string[] = [];
        for (const token of fold(text).matchAll(/[\p{L}\p{N}_-]+/gu)) {
          const word = token[0];
          if (Buffer.byteLength(word) > 256) { (budget.partialReasons ??= []).push("stats_token_limit"); break files; }
          window.push(word); if (window.length > ngram) window.shift(); if (window.length < ngram) continue;
          const term = window.join(" "); let value = counts.get(term);
          if (!value) {
            if (counts.size >= 20000 || vocabularyBytes + Buffer.byteLength(term) > 2 * 1024 * 1024) { (budget.partialReasons ??= []).push("stats_vocabulary_limit"); break files; }
            vocabularyBytes += Buffer.byteLength(term);
            value = { occurrences: 0, segments: 0, conversations: 0, lastSegment: -1, lastConversation: -1 }; counts.set(term, value);
          }
          value.occurrences++;
          if (value.lastSegment !== segmentNumber) { value.segments++; value.lastSegment = segmentNumber; }
          if (value.lastConversation !== conversationNumber) { value.conversations++; value.lastConversation = conversationNumber; }
        }
      }
    }
    if (!header || skipped || !best || count < min) continue;
    matched++;
    if (!params.stats) {
      const actualTitle = title || deriveTitle(preview);
      rows.push({ id: header.id ?? file, title: actualTitle, preview, message_count: count, updated_at: updated, ...(scope === "all" ? { workspace_path: header.cwd } : {}), matched_segment: best, _score: fold(actualTitle).includes(fold(query)) ? 1 : 0 });
      rows.sort(compare); if (rows.length > limit) rows.pop();
    }
  }
  runtime.signal?.throwIfAborted();
  const coverage = { complete: !budget.partialReasons?.length, scan: budget.counters, ...(budget.partialReasons?.length ? { partial_reasons: [...new Set(budget.partialReasons)] } : {}) };
  const filter = { ...(workspace ? { workspace_path: workspace } : {}), ...(params.tool_name ? { tool_name: params.tool_name } : {}), ...(params.segment_kind ? { kind: params.segment_kind } : {}), ...(params.tool_outcome ? { outcome: params.tool_outcome } : {}) };
  if (params.stats) return { ...coverage, stats: true, scope, filter, ngram, top_terms: top, segments_scanned: segmentNumber,
    terms: [...counts].map(([term, v]) => ({ term, occurrences: v.occurrences, segments: v.segments, conversations: v.conversations })).sort((a,b) => b.occurrences-a.occurrences || a.term.localeCompare(b.term)).slice(0,top) };
  return { ...coverage, scope, query: fold(query), sort, order, segment_filter: filter, results: rows.map(({ _score, ...row }) => row), ...(matched > rows.length ? { truncated: true } : {}) };
}

function sanitize(value: any, key = "", depth = 0): any {
  if (depth > 32) return "[TRUNCATED]";
  if (/(api.?key|authorization|token|password|secret|credential|private.?key|cookie|session.?id|client.?secret)/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((x) => sanitize(x, key, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k, depth + 1)]));
  return value;
}
function fitRow(message: AnyMap, budget: number, humanOnly: boolean): { row?: AnyMap; size: number; truncated: boolean } {
  const base: AnyMap = { id: message.id, timestamp: message.timestamp, role: message.role, content: "" };
  if (Buffer.byteLength(JSON.stringify(base)) > budget) return { size: 0, truncated: true };
  const source = redact(message.content); const chars = [...truncateUtf8(source, budget)]; let lo = 0, hi = chars.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); base.content = chars.slice(0, mid).join(""); if (Buffer.byteLength(JSON.stringify(base)) <= budget) lo = mid; else hi = mid - 1; }
  base.content = chars.slice(0, lo).join(""); let truncated = lo < chars.length || Buffer.byteLength(source) > budget;
  if (!humanOnly) for (const key of ["tool_calls", "tool_results"]) for (const item of message[key] ?? []) { const candidate = [...(base[key] ?? []), sanitize(item)]; base[key] = candidate; if (Buffer.byteLength(JSON.stringify(base)) > budget) { base[key].pop(); if (!base[key].length) delete base[key]; truncated = true; break; } }
  return { row: base, size: Buffer.byteLength(JSON.stringify(base)), truncated };
}

export async function historyGet(params: AnyMap, runtime: HistoryRuntime): Promise<AnyMap> {
  params = normalizeHistoryGetParams(params);
  const cwd = canonicalWorkspace(runtime.cwd, "workspace path");
  if (typeof params.all_workspaces !== "undefined" && typeof params.all_workspaces !== "boolean") throw new Error("HistoryGet: all_workspaces must be a boolean");
  const all = Boolean(params.all_workspaces), selected = all ? "" : params.workspace_path != null ? canonicalWorkspace(params.workspace_path, "workspace_path") : cwd;
  const id = typeof params.conversation_id === "string" ? params.conversation_id.trim() : ""; if (!id) throw new Error("HistoryGet: conversation_id is required");
  const maxMessages = integer(params, "max_messages", 20, 100), maxChars = integer(params, "max_chars", 12000, 50000), humanOnly = bool(params, "human_only", false);
  if (params.tail !== undefined && params.offset !== undefined) throw new Error("HistoryGet: tail and offset are mutually exclusive");
  if (params.offset !== undefined) integer(params, "offset", 0, Number.MAX_SAFE_INTEGER, true);
  if (params.tail !== undefined) integer(params, "tail", 20, 100);
  if (!existsSync(runtime.root)) throw new Error("HistoryGet: conversation not found");
  const budget: HistoryBudget = { maxTotalBytes: 256 * 1024 * 1024, maxFiles: 10000, maxDirectoryEntries: 20000, maxDepth: 32, deadline: Date.now() + 30000, signal: runtime.signal };
  const matches: Session[] = [];
  let foundInOtherWorkspace = false;
  for await (const file of discoverHistoryFiles(runtime.root, budget)) {
    if (!file.endsWith(".jsonl")) continue;
    let header: AnyMap | undefined;
    for await (const { value: entry } of readHistoryRecords(file, budget)) {
      runtime.signal?.throwIfAborted();
      if (entry.type === "session") { header = entry; break; }
    }
    if (header?.id !== id) continue;
    if (typeof header.cwd !== "string" || !isAbsolute(header.cwd)) continue;
    if (!all && resolve(header.cwd) !== selected) { foundInOtherWorkspace = true; continue; }
    const candidate = await loadSessionForGet(file, id, maxMessages, budget, maxChars, params.offset, params.tail);
    if ((all || resolve(candidate.cwd) === selected) && candidate.id === id) matches.push(candidate);
    if (matches.length > 1) throw new Error("HistoryGet: conversation_id is ambiguous across stored sessions");
  }
  runtime.signal?.throwIfAborted();
  if (budget.partialReasons?.length) throw new Error(`HistoryGet: lookup incomplete (${budget.partialReasons.join(", ")})`);
  if (!matches.length) {
    if (foundInOtherWorkspace && !all)
      throw new Error("HistoryGet: conversation does not match the requested workspace");
    throw new Error("HistoryGet: conversation not found");
  }
  if (matches.length > 1)
    throw new Error("HistoryGet: conversation_id is ambiguous across stored sessions");
  const conv = matches[0];
  const total = (conv as any)._messageCount ?? conv.messages.length; let start = 0, end = total;
  if (params.offset !== undefined) { start = Math.min(total, integer(params, "offset", 0, Number.MAX_SAFE_INTEGER, true)); end = Math.min(total, start + maxMessages); }
  else if (params.tail !== undefined) { const tail = Math.min(integer(params, "tail", 20, 100), maxMessages); start = Math.max(0, total - tail); }
  else start = Math.max(0, total - maxMessages);
  const selectedMessages = conv.messages;
  const selectedStart = params.offset !== undefined ? start : Math.max(start, total - selectedMessages.length);
  let remaining = maxChars, omitted = start + total - end, filtered = 0, contentTruncated = Boolean((conv as any)._clipped); const messages: AnyMap[] = [];
  for (let j = selectedMessages.length - 1; j >= 0; j--) {
    const i = selectedStart + j;
    const original = selectedMessages[j]; if (humanOnly && !["user", "assistant"].includes(original.role)) { filtered++; continue; }
    const content = humanOnly ? cleanHistoryText(original.content) : original.content;
    if (humanOnly && (!content || original.role === "user" && !substantive(content))) { filtered++; continue; }
    const fitted = fitRow({ ...original, content }, remaining, humanOnly);
    if (!fitted.row) { omitted += i - start + 1; contentTruncated = true; break; }
    remaining -= fitted.size; contentTruncated ||= fitted.truncated; messages.unshift(fitted.row);
  }
  return { conversation_id: conv.id, workspace_path: conv.cwd, messages, total_message_count: total, window_start: start, window_end: end, rendered_message_count: messages.length, ...(conv.title ? { title: conv.title } : {}), ...(omitted || contentTruncated ? { truncated: true } : {}), ...(contentTruncated ? { content_truncated: true } : {}), ...(omitted ? { omitted_message_count: omitted } : {}), ...(filtered ? { filtered_message_count: filtered } : {}), ...(!total || !messages.length ? { empty: true } : {}), metadata_truncated: false };
}

/** Apply HistoryGet's max_chars cap to the complete serialized JSON envelope. */
export function boundedHistoryJSON(input: AnyMap, maxChars: number): { value: AnyMap; text: string } {
  const value = structuredClone(input);
  let text = JSON.stringify(value);
  if (Buffer.byteLength(text) <= maxChars) return { value, text };
  while (value.messages?.length && Buffer.byteLength(text) > maxChars) {
    value.messages.shift(); value.empty = value.messages.length === 0; value.rendered_message_count = value.messages.length; value.truncated = true; value.content_truncated = true; value.omitted_message_count = (value.omitted_message_count ?? 0) + 1; text = JSON.stringify(value);
  }
  if (Buffer.byteLength(text) <= maxChars) return { value, text };
  if (typeof value.title === "string" && value.title !== "") {
    const original = [...value.title]; let lo = 0, hi = original.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2); value.title = original.slice(0, mid).join(""); value.metadata_truncated = true;
      if (Buffer.byteLength(JSON.stringify(value)) <= maxChars) lo = mid; else hi = mid - 1;
    }
    value.title = original.slice(0, lo).join(""); value.metadata_truncated = true; text = JSON.stringify(value);
  }
  if (Buffer.byteLength(text) <= maxChars) return { value, text };
  text = maxChars >= 18 ? `{"truncated":true}` : maxChars >= 2 ? "{}" : "0";
  return { value: JSON.parse(text), text };
}

export function historyRootFromContext(ctx: any): string {
  const dir = ctx?.sessionManager?.getSessionDir?.();
  if (dir) {
    const parent = dirname(dir);
    return dirname(parent).endsWith(".pi/agent") ? parent : dir;
  }
  return resolve(process.env.PI_CODING_AGENT_DIR ?? `${process.env.HOME ?? process.cwd()}/.pi/agent`, "sessions");
}

function boundSearchResponse(value: AnyMap): AnyMap {
  const list = value.results ?? value.terms;
  while (Array.isArray(list) && list.length && Buffer.byteLength(JSON.stringify(value)) > 65536) {
    list.pop(); value.truncated = true; value.output_truncated = true;
  }
  return value;
}
