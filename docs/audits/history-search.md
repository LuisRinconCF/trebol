# History search audit

## Summary

Audit of the current Pi implementation, not a diagnosis from a production heap dump. Production code is unchanged. Independent detailed findings are in [resources](history-search-resources.md) and [correctness](history-search-correctness.md). Synthetic evidence and existing-test output are distinguished from static analysis below.

The central design error is treating response limits as memory limits. The public search materializes a corpus before filtering workspace, matching, ranking, and taking a result limit. Lowering `limit` cannot fix that allocation pipeline.

Highest priorities: corpus retention and oversized records; unsafe regex execution; unredacted search output; ignored cancellation; unbounded previews/snippets/stats; silent incomplete discovery. Existing focused tests pass but do not exercise these conditions. A bounded fallback-path synthetic probe returned zero matches while still loading unrelated-workspace data; it did not reproduce a production crash. See the resource report for measurement caveats.

## Execution map

- Public entry: `.pi/extensions/30-tools/swarm-history-vault-tools.ts:27-50` registers `HistorySearch` and `HistoryGet`. `execute` receives but ignores `_signal`. Search serializes a recursively key-sorted result; Get additionally applies a serialized byte cap.
- Contract boundary: `.pi/lib/runtime/swarm-tool-surface.ts:43-62,85-86,95-108` deliberately installs permissive runtime schemas for these tools. Advertised schemas are not runtime validation; every omitted implementation check matters.
- Search: `.pi/lib/tools/swarm-history-tools.ts:119-164,241-299` discovers sessions using a dynamically imported UI extension's engine; fallback recursively enumerates without equivalent bounds. Normal discovery parses each candidate file just to list its header. Search then reads/parses each file again, retains raw entries, converted messages, segments and concatenated bodies, and only then filters workspace/minimum message count. Matching and snippet generation precede whole-result sorting and slicing.
- Segment/stats branch: same corpus loading, followed by another flattened segment collection (`301-338`), optional filtering, then frequency-map/set aggregation or sorting/deduplication. No persistent search cache/index exists in this module.
- Get: `196-222,357-394` enumerates every file, reads headers for ID matches, concurrently loads matching files, then filters workspace. Its streaming reader (`166-194`) bounds retained message count but not bytes per message or JSONL line. Pagination counts original stored message entries; human filtering occurs afterwards. Content fitting and envelope fitting are separate passes (`347-355,397-415`).
- Lowercase `history_search`: separately registered by `.pi/extensions/30-tools/history-search.ts:122` and included in the layer manifest; its engine is also a dependency of uppercase search discovery. It has list/search/read/json_search operations with different semantics, validation and redaction. Registration alone does not establish model-facing activation under runtime gating.
- State is per-call except engine configuration and registration/session context. Reads do not intentionally mutate history. Ordinary directory walking ignores symlink directory entries; the lowercase explicit read additionally realpaths and checks root containment. These are useful safeguards, not protection against concurrent path replacement.
- Error paths differ: broad discovery/parse catches silently skip files; the public adapter wraps uncaught errors with an error ID. Missing root returns empty search results. No completeness/error counters, elapsed-work budget, cancellation propagation or shared concurrency budget is exposed.
- Scope defaults to current workspace; all-workspace search includes workspace provenance and Get accepts explicit cross-workspace opt-in. This is result filtering, not early I/O isolation. Current tests verify scoped duplicate-ID retrieval and rejection of global ambiguity.

## Resources

See [detailed resource audit](history-search-resources.md). Source inspection already establishes corpus-proportional retention and late limits; exact contribution to the reported live OOM remains unproven without runtime/deployment and crash evidence.

## Correctness API

See [detailed correctness audit](history-search-correctness.md). Additional lowercase-engine issues found during parent review:

1. **High: read pagination silently skips unrendered records.** `history-search.ts:82-85` breaks at the first row exceeding the text budget, but computes `recordLimit` and `nextOffset` from all selected records. A too-large first row yields an empty transcript while advancing beyond it and possibly declaring EOF. Advance only over emitted records and return an explicit oversized/truncated-record disposition.
2. **Medium: current-session exclusion ignores constructor state.** The lifecycle supplies `currentSession` in constructor options (`122`); list/search only inspect per-call `options.currentSession` (`66,73`). Resolve configuration once and test default exclusion plus explicit inclusion.
3. **Medium: dotted-path JSON search has false positives and swallowed errors.** `90` searches `JSON.stringify(v ?? value)` when a requested path is absent/null, so unrelated whole-record text can match. With `includeValues`, undefined goes through `cap`, throws, and the file-level catch drops the remaining records. Define missing versus null semantics and isolate errors per record.
4. **Medium: scan telemetry overstates completed work.** `89-91` returns candidate count as `scanned` even when early-stopping or skipping files. Separate discovered/opened/completed/skipped counts and signal partial results.
5. **Low: renderer uses escaped separators literally.** `103,110,116,119,123` uses `"\\n"` and `/\\s+/g` where actual newline/whitespace is intended. Rendering has literal backslash-n separators and fails whitespace collapsing/line limits. Snapshot multiline content and real whitespace.
6. **Documentation/architecture debt:** `docs/reference/history-search.md` describes only the lowercase API and asserts bounded memory for a 10 GB corpus. It does not document the materially different public uppercase allocation path; even the lowercase hit list and JSON per-file accumulator are not bounded by the returned limit. Its bounded-memory and all-output-redacted claims require correction alongside implementation fixes.
7. **High: silent incomplete discovery.** Normal discovery stops at the first 1000 filesystem-order paths and skips files over 50 MiB (`history-search.ts:45-68`), then sorts that subset. A recent or relevant session outside the subset never competes. Search `truncated` only reflects matching result count (`swarm-history-tools.ts:293-299`), not skipped corpus. Return discovery completeness and deterministic traversal, or use an index supporting global ordering.
8. **Medium: stats ignores the query and regex.** `swarm-history-tools.ts:315-319` aggregates immediately; matching at `321-325` is reached only outside stats. Case-sensitive stats still lowercases all tokens and runtime cleanup occurs regardless of exclude_runtime. Either apply declared controls consistently or reject incompatible combinations explicitly.
9. **Medium: tool results count as prose and as results.** `convertMessage` retains tool-result text as `content` and as `tool_results.output` (`107-116`), then `loadSessions` creates both message and tool-result segments (`154-158`). Default body search includes tool output despite the description's substantive-user/assistant wording; unrestricted stats double-counts tool-result words. Give each payload one canonical segment classification and specify cross-mode inclusion.
10. **Medium: validation is incomplete and sometimes post-I/O.** Permissive registration relies on handwritten checks, but query type and snippet/exclude_runtime/stats booleans are not consistently rejected; snippet bounds are checked only on matching data. Get validates offset/tail after discovering and loading (`366-379`). Validate all inputs and combinations before disk access, with data-independent errors.
11. **Medium: malformed valid JSON can terminate the search.** Parsing accepts primitives/null; subsequent `entries.find(e => e.type...)` (`145-146`) assumes objects. Conversion assumes text block strings; later `stat` is outside the read catch (`161`). A syntactically valid bad record or concurrent deletion can fail the whole corpus request. Validate record shape, isolate file errors and report partial coverage.
12. **Medium: snippet matching and mode provenance drift.** `snippet` lowercases term lookup even for case-sensitive search (`231-238`), potentially showing an earlier wrong-case occurrence. Segment output always includes a compact leading excerpt rather than a bounded window around the match, ignores snippet controls, and omits truncation when more unique sessions exist (`336-338`). Add exact-match offsets and consistent completeness metadata.
13. **Low/medium: Get envelope edge cases.** Envelope fitting can remove every message without updating `empty`; very small budgets degrade to `{}` or `0` (`397-415`), discarding identity and explicit truncation. `max_chars` is actually UTF-8 bytes. Reserve a minimum metadata envelope, declare the unit and minimum budget, and recompute metadata after final fitting.
14. **Semantic risk: missing cwd and session naming.** `resolve(s.cwd)` turns missing cwd into process.cwd instead of rejecting unknown scope (`263,369`); `header.name` is the only persisted-title source (`150,192`). Verify actual session-info rename events before claiming persisted titles are honored. These require targeted compatibility fixtures, not assumptions about historical storage.

## Test gaps

Executed: `timeout 90s node --max-old-space-size=512 node_modules/vitest/vitest.mjs run .pi/test/tools/swarm-history-vault-tools.test.ts --maxWorkers=1` on Node v26.5.0. **12/12 passed**, including unrelated vault tests; this is not 12 history tests. Output: `artifacts/history-audit/existing-tests.log`.

Meaningful current assertions in `.pi/test/tools/swarm-history-vault-tools.test.ts`:

| Lines | Proven by existing assertions | Missing adjacent coverage |
| --- | --- | --- |
| 32-41 | Advertised contract/schema overlay and permissive registration | Complete runtime validation, pre-I/O rejection |
| 43-53 | Basic query, simple regex, snippets, small frequency counts | Corpus/record scaling, regex worst case, filtered stats, payload bytes |
| 55-63 | Field normalization, segment case matching and recency ascending | Runtime pseudo-message parity, mode/filter combinations, stable ties |
| 65-94 | Tail/offset windows, neutral defaults, content truncation | Invalid tail/offset before I/O, Unicode byte boundary, metadata redaction |
| 96-157 | Tail/message cap, registered byte cap and retained identity, independent calls | Giant message, all rows dropped/empty flag, cancellation and concurrent memory |
| 159-179 | Workspace-specific duplicate-ID retrieval, global ambiguity | Discovery beyond 1000 files, missing cwd, malformed records, corrupt sibling file |

No direct `HistorySearchEngine` tests were found in `.pi/test` or `tests` by the targeted search. Add lowercase read pagination, missing JSON path, current-session exclusion and renderer tests if that surface remains supported. No existing RSS assertion was found in the inspected history test file. Tests passing on two tiny sessions provide no scale guarantee.

## Fix specifications

Do not enlarge the Node heap as the primary fix: that only postpones the failure and does not fix cancellation, response-size or completeness semantics.

| Order | Independently verifiable fix | Required proof and compatibility decision |
| --- | --- | --- |
| 1 | Shared bounded reader and early scope filtering, followed by bounded top-K matching | Resource-report thresholds; huge unrelated workspace must not change retained payload memory. Preserve ranking on small complete fixtures; expose partial scans. |
| 2 | Bounded Get record/window handling and pre-I/O validation | Huge line never allocates its full decoded payload; valid tail/offset results stay unchanged. Define oversized-message disposition without skipping undisclosed records. |
| 3 | Real RE2-compatible execution and abort/deadline plumbing | Nested-quantifier rejection or linear execution in isolated timeout test; ordinary literals/classes remain allowed; cancelled calls release streams and admission slots. |
| 4 | Unified redaction plus response budgets | Synthetic credentials in title, preview, snippet, tool JSON, stats tokens and ordinary content never appear in content or details. Unicode payload fits serialized cap with provenance intact. |
| 5 | Bounded stats and consistent mode semantics | Query/regex/case/fields/runtime/tool combinations have explicit accepted/rejected behavior; one tool-result fixture counted exactly once; cardinality cap produces explicit partial/approximate status. |
| 6 | Discovery/error/completeness contract | Over-1000-files, oversize, invalid JSON shape, unreadable file, disappearing file, missing cwd and duplicate-ID fixtures distinguish no match from incomplete scan. No fallback silently widens budgets. |
| 7 | Repair remaining API defects or retire lowercase surface deliberately | Tests for skipped read records, constructor current-session exclusion, missing JSON path, exact snippet location, tiny envelopes, multiline renderer. Unsupported origin must fail explicitly, not return unfiltered results. |
| 8 | Consolidate architecture/documentation and regression gates | Domain reader no longer imports UI extension; document actual uppercase API, units, limits, ordering and partial results. Keep public defaults/handoff stable unless a documented compatibility correction is approved. |

Each row is a proposed follow-up, not an implemented fix. Initial resource thresholds are proposals requiring product validation. A disk-backed index is an optional later optimization; streaming, early scope checks, explicit budgets and truthful errors are prerequisites regardless.

## Limitations

No production heap snapshot or crashing request was supplied. No private transcript corpus was scanned. Full repository tests were not run. Read-only audit coverage is broad, not a guarantee that every possible defect was found. Source line references describe this checkout and may move after fixes.
