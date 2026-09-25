# History search implementation

## Primitive model

Verified against current source: public HistorySearch/Get use the library through the uppercase adapter; search still imports the lowercase UI engine for discovery, retains the corpus and filters scope afterwards. Schemas are permissive at runtime. No existing regex/index dependency is declared at root. Existing audit findings therefore remain applicable. Unrelated working-tree edits must be preserved.

## Approval

User delegates architectural choices and requests an iterative loop: fix one problem, stress test, investigate the next failure, repeat. Proposed initial choice: bounded streaming without a persistent index. No live history modification or scanning is required for synthetic tests. This document is the implementation plan pending plan approval.

## Architecture

1. Establish deterministic fixtures and a runnable baseline before changing behavior. Keep test tooling separate from production dependencies.
2. Replace lowest-level discovery/reading first: UI-independent async directory traversal, fixed byte chunks, bounded complete-record assembly, record shape checks, early header/scope checks, cancellation and explicit scan counters. Remove the wider unbounded fallback. Test this layer before migrating consumers.
3. Migrate search to per-session streaming accumulators and bounded top-K results, then Get to bounded selected rows and header-only target discovery. Do not retain full transcript entries, bodies or segment arrays. Preserve scoped duplicate-ID checks and public IDs/window provenance.
4. Replace native user regex execution with a maintained linear-time RE2-compatible dependency after checking install/runtime compatibility. Do not substitute a blacklist or synchronous timeout. Bound query length and document any semantic corrections, especially regex boundaries across messages.
5. Unify redaction and bounded snippets/output, repair option validation, tool-result classification, stats filtering, partial-result metadata and lowercase pagination. Keep exact stats only within a declared cardinality budget; stop explicitly rather than silently approximate.
6. Propagate AbortSignal through adapters and all I/O. Bound admitted expensive calls and their waiting queue. Always release resources in finally paths. Avoid long-lived transcript caches; no persistent index in this iteration.
7. Update contracts, reference docs and AGENTS architecture notes as appropriate; preserve unrelated existing edits. Review final changes independently and run focused plus broader regression tests.

## Initial budgets

Centralize internal limits, with explicit test overrides rather than new model-facing tuning parameters. Initial design targets: 64 KiB read chunks, 1 MiB maximum JSONL record, 64 KiB serialized search response, 4096-byte query/regex input, bounded stats vocabulary/incidences, 30-second scan deadline, finite file/directory/depth and aggregate-byte budgets. Choose exact traversal/statistics counters during primitive implementation and document them here. Skipped oversized records and exhausted work budgets must report incomplete coverage, never ordinary no-match success. Cancellation should settle within 250 ms at checkpoints. Get retains its existing max_chars contract while fixing metadata edge cases explicitly.

## Workloads

Use synthetic disposable roots only; child heap ceiling 256 MiB, enforced wall-clock watchdog, bounded logs and cleanup. Where available use an OS memory limit; distinguish heap limits from RSS limits and fail/report unsupported containment rather than claiming it. Baseline and execution measurements must separate fixture generation/compiler overhead from search where practical.

Start with small exact semantic fixtures, then 16 MiB, 128 MiB and 1 GiB short-record corpora, unrelated-workspace growth, >1000 files, giant single/no-newline records, dense hits, high-cardinality ngrams, hostile regex, malformed records, Unicode/redaction, duplicate IDs, cancelled reads, repeated requests and concurrent requests. Target incremental peak RSS below 128 MiB at concurrency one on the 1 GiB workload. Work-limit exits count as correct partial handling, not completed-corpus search. Check full-completion cases separately with sufficiently generous test scan budgets.

## Iteration and stability

For each primitive fix: reproduce the defect safely, implement one change, run focused semantic tests, run relevant stress workloads, record any new failure, then repair it before expanding scale. Do not silently weaken ceilings. After the last code change, repeat the complete defined stress matrix three times and run a 100-request mixed search/Get/cancel soak. Record seeds, environment, exact commands, results, peak memory, durations and residual limitations. Broader repository failures must be separated from history regressions.

## Breaking points and compatibility

Streaming must preserve all-term matching across messages without reconstructing whole bodies. Cross-message regex semantics may require an explicit documented restriction or bounded strategy; test before choosing. Scope metadata is untrusted: missing/invalid cwd must not become process.cwd. Concurrent append/delete, symlink changes, corrupt headers and duplicate IDs require explicit failure/completeness behavior. Redaction must occur on complete bounded records before snippets/tokenization. Final serialized budgets cover both content and details. Reader changes affect uppercase search/Get and the lowercase engine; adapters require independent compatibility tests. Safe regex dependency must work in global installs without developer-only packages or vendor imports.

## Acceptance

Implemented directly after the user requested no more delegation or new tests. Existing tests were run; disposable shell-driven probes were used rather than adding further tests. No private history was scanned.

## Reader

Shared discovery/byte reader replaces whole-file and readline paths. Record assembly is capped at 1 MiB, reads use 64 KiB chunks, oversized records drain without growing buffers, invalid records report incomplete coverage. Reads reject non-regular files and final-component symlinks, close handles in finally, yield between chunks and observe cancellation. Traversal/scan budgets are finite. Concurrent ancestor replacement is not fully protected.

## Matching redaction

User regex uses re2-wasm, bounded at 4096 bytes. Redaction occurs before public search matching and returned excerpts; quoted assignments and bearer-token ordering were repaired. Stats has 20,000-term / 2 MiB vocabulary limits and a 256-byte token limit; exceeding them reports partial exact counts, not approximate full-corpus counts. Deep tool-value sanitization stops at depth 32.

## Search pipeline

Ordinary search keeps bounded metadata, per-term found bits, small excerpts and top-K results. Terms can occur in different records; regex is evaluated per record, not over a reconstructed transcript. Segment/stats search now streams records, classifies tool results once, and retains at most top-K results or bounded vocabulary counters. Public responses are capped at 64 KiB. Work budgets: 256 MiB scanned bytes, 10,000 discovered files, 20,000 directory entries, depth 32, 30 seconds. `complete`, `scan`, and `partial_reasons` distinguish partial coverage from full scans. Unsupported origin and incompatible field/segment options fail explicitly. Lowercase engine shares the reader, bounds hits/read windows, repairs missing JSON-path matching, and raises an incomplete-scan error rather than returning an apparently complete array.

## Get

Get discovers ID headers sequentially, rejects other workspaces before body loading, uses bounded records and individually fitted selected rows, and rejects incomplete lookup rather than claiming global uniqueness. Adapter forwards cancellation and holds a single-operation admission slot through serialization. Concurrent requests fail busy instead of building an unbounded queue. Missing-root/not-found stale references were repaired. Selection remains bounded by max_messages times max_chars, not corpus size.

## Stability

Observed Node v26.5.0, isolated processes with 192 MiB V8 old-space cap and 30/90-second shell watchdogs. This is **not an OS RSS limit**. No host OOM was induced.

- Existing focused suites: **28/28 passed** across five files after integration. No new tests written in the final direct implementation turn.
- Core history TypeScript check passed. Adapter-wide check remains blocked by missing `@earendil-works/pi-tui` typings and an unrelated existing `swarm-bash.ts:360` argument error. Changed adapters also passed TypeScript transpilation diagnostics.
- 135,102,179-byte synthetic session: three complete searches, late marker found; 926/873/912 ms, maximum process RSS 74,568 KiB. Tail Get passed. Exact stats counted 16,500,000 occurrences over 33,000 segments.
- 1,074,250,000-byte corpus: three runs scanned exactly 268,435,456 bytes, correctly reported incomplete coverage; 1695/1572/1604 ms, peak RSS 84,380 KiB. These are **budget-stop tests, not complete 1 GiB searches**.
- 1,100-file search completed; 100 repeated searches completed, cumulative process peak RSS 118,500 KiB.
- Mid-scan cancellation settled in 10.2 ms. Giant record skipped while later match survived with partial metadata; high-cardinality stats stopped at its vocabulary budget.
- Hostile `(a+)+$` over 100,000 characters with body-only filtering completed in 23.5 ms; secret fixture passed. Initial regex probe incorrectly expected no metadata match; corrected oracle explicitly selected body, preserving the failed probe in the log.
- Evidence: ignored `artifacts/history-audit/current/{stress,gib,edges,final-tests,types,adapter-types}.log`. These ad-hoc runs are measurements, not a committed reusable stress harness.

## Remaining limitations

Full original acceptance is not claimed: no complete 1 GiB scan under a raised budget, no OS-enforced RSS containment, no independent final review, and no complete three-repeat matrix after every last metadata/validation change. No full repository suite run. Lowercase runtime loading was not exercised because the UI dependency is unavailable locally. Persistent indexing is intentionally absent. Preview/title matching is bounded and can omit matches beyond the metadata excerpt; source-record regex semantics differ from the old concatenated body. No guarantee of perfect secret detection or stability on all platforms.

## JSONL reader optimization

Further direct optimization replaces the JavaScript per-byte newline loop with native `Buffer.indexOf`, reuses one 64 KiB input buffer, decodes in-buffer records directly without `Buffer.concat`, and lazily grows bounded assembly storage only for records crossing read boundaries. Event-loop yielding is time-sliced at approximately 8 ms between chunks, with cancellation checks per record. Native `JSON.parse` remains the decoder: no raw-text grep shortcut that could miss escaped JSON strings or bypass field semantics.

Compared preserved pre-change and post-change transpiled readers against the same disposable 161,720,000-byte / 40,000-record escaped-Unicode fixture under a 192 MiB V8 heap ceiling and 90-second watchdog. Alternating order, three runs each: before 1047/926/979 ms; after 437/430/372 ms. Median speedup approximately **2.28×**. All runs decoded exactly 40,000 objects with no partial reasons. Same-process peak RSS reached 68,556 KiB; this is not an isolated per-implementation memory comparison. Evidence: `artifacts/history-audit/parser/comparison.log`. Existing reader and integration suites: 22/22 pass; reader TypeScript check and diff whitespace check pass. No new tests added. This measurement isolates reader throughput, not total end-to-end search speed.

## Schema projection experiment

Implemented and measured a structural selective scanner, including string escapes, reordered/duplicate keys, bounded nesting and native fallback. It lost to native JSON.parse: 150 iterations of a 300 KB image record took about 48 ms versus 12 ms native; a 398 KB nested tool-argument record took about 491 ms versus 286 ms native. An optimized string scan and native nested-object fallback improved the comparison but image records remained slower (300 iterations: ~31 ms versus ~17 ms); nested objects were approximately tied (~419 ms versus ~425 ms). The slower scanner was therefore **not shipped**. Experimental source and logs remain ignored under `artifacts/history-audit/projection/`.

Shipped `history-projection.ts` uses native decoding followed by an explicit prose schema projection. Ordinary search receives only identity/metadata, role and text/type blocks; image data, tool arguments, thinking and opaque details are not retained by downstream conversion. This is not selective byte decoding and no new throughput speedup is claimed. Canonical `session_info` title updates and explicit clears are now honored in ordinary search, segment/stats metadata and Get. Existing suites 22/22 pass, core typecheck and diff checks pass. No new test files were added. The prior paragraph's header-only title limitation is superseded for those uppercase paths.
