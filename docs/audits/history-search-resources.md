# History search resources

## Confirmed allocation/control-flow defects

References below use `S` = `.pi/lib/tools/swarm-history-tools.ts`, `E` = `.pi/extensions/30-tools/history-search.ts`, `A` = `.pi/extensions/30-tools/swarm-history-vault-tools.ts`.

| Priority | Finding | Evidence |
| --- | --- | --- |
| P0 | Public search retains the corpus before applying scope or limit. Entries (including unused large payloads), messages, body strings and tool parameter serialization coexist. Metadata-only/empty searches do the same work. | S:119-164,263-299 |
| P0 | No line-size bound. readline can accumulate an enormous newline-free record before JSON parsing. Get's bounded message count does not bound retained bytes; `fitRow` spreads the entire message into code points and repeatedly builds candidate strings before returning a small row. | S:166-194,209-222,347-354; E:53-56 |
| P0 | Advertised RE2 is native JS backtracking regex after a partial syntax blacklist. A nested-quantifier expression can monopolize the agent event loop. | S:224-229,278,325 |
| P1 | Cancellation is discarded; no deadlines, yield policy, aggregate memory admission or history-call concurrency bound. Concurrent calls multiply working sets. | A:37-39; E:122; S public signatures |
| P1 | Discovery parses whole files once, then search reads/parses them again. Lowercase list requires full-file JSON parsing just to retrieve a header. | E:62-69; S:130-145 |
| P1 | Fallback changes scale and correctness guarantees: broad catch removes the normal 1000-file and 50 MiB/file limits and uses corpus-wide Promise.all stat calls. UI dependency availability determines backend behavior. | S:127-140; E:10-11,45-56 |
| P1 | Ordinary search output has no byte cap. Preview is the entire cleaned first user message, even with limit=1. Regex snippets include the entire matched span, so context/max_snippets are not byte limits. Key sorting and JSON serialization add copies. | S:149-151,231-238,294-299; A:14-17 |
| P1 | Stats retain vocabulary map plus per-term sets of segment/conversation IDs, tokenize complete texts and sort all terms before top_terms. Bound is output rows, not aggregation memory. | S:301-318 |
| P1 | Lowercase search accumulates every matching hit before sorting/slicing; JSON search checks its limit only after a whole file, accumulating all matching records in that file. Read retains every parsed record before selecting a page. | E:71-91 |
| P1 | Get discovers all files on every ID lookup, scans headers including arbitrary pre-header records, and loads every duplicate-ID file concurrently before workspace filtering. | S:196-222,366-369 |
| P2 | File discovery materializes directory listings and path arrays. Normal cap counts matching files, not directory entries, recursion depth or bytes visited. Fallback/Get lack even that cap. | E:45-51; S:135-140,196-206 |
| P2 | File stat checks are not read-byte budgets: append/replacement between stat and read can exceed the initial size. No stable snapshot or mid-read byte accounting. | E:53-56; S:143-164 |

For corpus bytes B, largest record L, segments M, vocabulary V and distinct term/segment incidences I, public search retains O(B+M) data (with substantial string/object amplification), stats adds O(V+I), and ranking adds O(matches). Get retains O(max_messages × largest message size), not O(max_chars), plus line/parser memory O(L). Multiple simultaneous calls multiply these costs. Sequential normal file processing limits simultaneous open streams but does not bound retained sessions. There is no long-lived history result cache in these modules; this is primarily per-call over-allocation, not evidence of a persistent cache leak.

## Measured bounded probe

`artifacts/history-audit/resource-probe.mjs` transpiles only the library with installed TypeScript into an ignored artifact. Its relative UI import cannot resolve there, deliberately exercising the **fallback**, not the normal Pi UI path. Each disposable fixture file has one 1 MiB user message; every file belongs to another workspace. Query `absent`, current scope, limit=1 returns zero results.

Command: `timeout 30s node --expose-gc --max-old-space-size=256 artifacts/history-audit/resource-probe.mjs N`, Node v26.5.0. Fixture creation and compiler load are included in process max RSS, so these figures are not isolated search peaks and are not a production benchmark.

| N / fixture MiB | Results | Heap used before / after | Process max RSS |
| --- | --- | --- | --- |
| 2 / 2 | 0 | 16,093,336 / 28,789,480 bytes | 165,724 KiB |
| 16 / 16 | 0 | 16,059,992 / 34,314,368 bytes | 212,680 KiB |

Both exited normally; no deliberate heap failure or host OOM was induced. GC timing makes after-call heap non-monotonic as a scaling metric. The probe confirms discarded-workspace corpus loading is reachable in fallback, not the precise cause of the user's incidents. Output is preserved in `artifacts/history-audit/resource-results.log`. Normal discovery behavior is established by source inspection, not this measurement.

## Fix and verification requirements

1. Build one UI-independent bounded JSONL reader with maximum record bytes, total bytes/files/deadline budget, AbortSignal, explicit cleanup and skip/error counters. Never read a whole file to locate its header. Oversized records must be drained/skipped incrementally or stop with a structured partial result.
2. Reject workspace and ID mismatches before payload conversion; stream candidate matching and retain bounded top-K records. Compute body segments only for requested mode. Keep at most bounded snippet windows, not whole matched documents.
3. Give search a serialized response-byte budget covering previews, titles, IDs, paths, snippets and stats. Redact before bounded serialization; report truncation rather than silently omitting provenance.
4. Use an actual non-backtracking regex implementation with explicit supported syntax and pattern-length limits. Until then disable unsafe regex mode, not merely more blacklists.
5. Bound exact stats with a declared memory/term budget; report partial aggregation, or use a disk-backed index. Do not pretend an approximate heavy-hitter algorithm has exact counts.
6. Serialize or admission-control expensive calls. Enforce cancellation/deadlines within read and match loops; reserve cleanup capacity. Avoid corpus-wide Promise.all.
7. Regression matrix: 1 vs 100 unrelated workspaces; 1 vs 1000 matching files; giant single line and no newline; many short hits; high-uniqueness ngrams; very long regex match; cancellation pre-start and mid-read; duplicate IDs; mutation during read; import failure. Run each with subprocess timeout, heap ceiling and fixture cleanup.
8. Proposed initial acceptance targets (design choices, not existing guarantees): reject/skip records over 1 MiB, keep serialized search output under 64 KiB, cancellation settles within 250 ms at reader checkpoints, and peak incremental RSS under 128 MiB for a 1 GiB short-record corpus at concurrency=1. Run baseline and search in separate subprocesses; record Node version and RSS methodology. Tune budgets explicitly if valid product use cases require larger records.
