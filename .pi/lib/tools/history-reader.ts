import { opendir, open } from "node:fs/promises";
import { constants, type Dir } from "node:fs";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { parseProseRecord } from "./history-projection.ts";
import { join } from "node:path";

/** Limits shared by discovery and record reading. Counters and partialReasons are updated in place. */
export interface HistoryBudget {
	/** Optional schema-aware projection; other consumers keep full JSON semantics. */
	projection?: "prose";
	maxTotalBytes: number;
	maxFiles: number;
	maxDirectoryEntries: number;
	maxDepth: number;
	/** Absolute deadline in epoch milliseconds; defaults to no deadline. */
	deadline?: number;
	/** Optional cooperative cancellation. */
	signal?: AbortSignal;
	/** Maximum encoded record size; defaults to 1 MiB. */
	maxRecordBytes?: number;
	counters?: { bytes: number; files: number; directoryEntries: number };
	partialReasons?: string[];
}

export interface HistoryOptions extends HistoryBudget {}
export interface HistoryLine<T = Record<string, unknown>> { value: T; line: number }

const CHUNK = 64 * 1024;
const DEFAULT_RECORD = 1024 * 1024;

function state(b: HistoryBudget) {
	return { counters: b.counters ?? (b.counters = { bytes: 0, files: 0, directoryEntries: 0 }), reasons: b.partialReasons ?? (b.partialReasons = []) };
}
function stop(b: HistoryBudget, reason: string): boolean {
	if (b.signal?.aborted) reason = "aborted";
	else if (b.deadline !== undefined && Date.now() >= b.deadline) reason = "deadline";
	else return false;
	const s = state(b); if (!s.reasons.includes(reason)) s.reasons.push(reason); return true;
}
function partial(b: HistoryBudget, reason: string) { const r = state(b).reasons; if (!r.includes(reason)) r.push(reason); }

/** Incrementally traverses regular files without following symlinks. Directory handles are closed even on cancellation. */
export async function* discoverHistoryFiles(root: string, budget: HistoryBudget): AsyncGenerator<string> {
	const s = state(budget);
	async function* walk(path: string, depth: number): AsyncGenerator<string> {
		if (stop(budget, "aborted")) return;
		if (depth > budget.maxDepth) { partial(budget, "maxDepth"); return; }
		let dir: Dir;
		try { dir = await opendir(path); } catch (e) { partial(budget, `directoryError:${(e as NodeJS.ErrnoException).code ?? "unknown"}`); return; }
		try {
			for await (const entry of dir) {
				if (stop(budget, "aborted")) return;
				if (s.counters.directoryEntries >= budget.maxDirectoryEntries) { partial(budget, "maxDirectoryEntries"); return; }
				s.counters.directoryEntries++;
				const child = join(path, entry.name);
				if (entry.isDirectory()) yield* walk(child, depth + 1);
				else if (entry.isFile()) {
					if (s.counters.files >= budget.maxFiles) { partial(budget, "maxFiles"); return; }
					s.counters.files++; yield child;
				}
			}
		} catch { partial(budget, "directoryReadError"); }
		finally { await dir.close().catch(() => {}); }
	}
	yield* walk(root, 0);
}

/** Read newline-delimited JSON using fixed-size byte reads; oversize records are drained, not retained. */
export async function* readHistoryRecords(file: string, budget: HistoryBudget): AsyncGenerator<HistoryLine> {
	const s = state(budget), limit = budget.maxRecordBytes ?? DEFAULT_RECORD;
	let handle;
	if (stop(budget, "aborted")) return;
	try { handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)); } catch (e) { partial(budget, `fileError:${(e as NodeJS.ErrnoException).code ?? "unknown"}`); return; }
	// Reuse the input buffer. Complete records decode directly from this buffer;
	// only a record crossing a read boundary needs bounded assembly storage.
	const input = Buffer.allocUnsafe(CHUNK);
	let assembly: Buffer | undefined;
	let offset = 0, line = 1, size = 0, oversized = false, eof = false;
	let nextYield = performance.now() + 8;
	function append(start: number, end: number): void {
		if (oversized || start === end) return;
		const needed = size + end - start;
		if (needed > limit) { oversized = true; size = 0; partial(budget, "maxRecordBytes"); return; }
		if (!assembly || assembly.length < needed) {
			const grown = Buffer.allocUnsafe(Math.min(limit, Math.max(needed, (assembly?.length ?? CHUNK) * 2)));
			if (size) assembly!.copy(grown, 0, 0, size);
			assembly = grown;
		}
		input.copy(assembly, size, start, end); size = needed;
	}
	try {
		if (!(await handle.stat()).isFile()) { partial(budget, "notRegularFile"); return; }
		while (!stop(budget, "aborted")) {
			const remaining = budget.maxTotalBytes - s.counters.bytes;
			if (remaining <= 0) { partial(budget, "maxTotalBytes"); break; }
			const { bytesRead } = await handle.read(input, 0, Math.min(CHUNK, remaining), offset);
			if (!bytesRead) { eof = true; break; }
			offset += bytesRead; s.counters.bytes += bytesRead;
			let start = 0;
			while (start < bytesRead) {
				if (stop(budget, "aborted")) return;
				// Buffer.indexOf uses native byte search instead of a JS byte loop.
				const newline = input.indexOf(10, start);
				if (newline < 0 || newline >= bytesRead) { append(start, bytesRead); break; }
				let value: Record<string, unknown> | undefined;
				if (!oversized && size === 0 && newline - start <= limit) value = parse(input, start, newline, budget);
				else {
					append(start, newline);
					if (!oversized) value = parse(assembly!, 0, size, budget);
				}
				size = 0; oversized = false;
				const ordinal = line++; start = newline + 1;
				if (value) yield { value, line: ordinal };
			}
			if (performance.now() >= nextYield) { await yieldTurn(); nextYield = performance.now() + 8; }
		}
		if (eof && !oversized && size > 0) { const value = parse(assembly!, 0, size, budget); if (value) yield { value, line }; }
		else if (!eof && size > 0 && !oversized) partial(budget, "truncatedFinalRecord");
	} catch (e) { partial(budget, `readError:${(e as NodeJS.ErrnoException).code ?? "unknown"}`); }
	finally { await handle.close().catch(() => {}); }
}

function parse(buffer: Buffer, start: number, end: number, budget: HistoryBudget): Record<string, unknown> | undefined {
  const text = buffer.toString("utf8", start, end);
  if (!text.trim()) return;
  try {
    const value: unknown = budget.projection === "prose" ? parseProseRecord(text) : JSON.parse(text);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* report malformed records as incomplete coverage */ }
  partial(budget, "invalidRecord");
  return undefined;
}
