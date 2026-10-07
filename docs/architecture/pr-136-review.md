# PR 136 review disposition

All 69 artifact findings were examined. IDs below are the artifact order (1-based).
Security/host compatibility tradeoffs are not represented as eliminated.

| ID | File | Disposition |
| --- | --- | --- |
| 1 | `.pi/lib/tools/pty-runner.py` | No defect: Popen.wait() returns an integer; reviewer explicitly confirms this. |
| 2 | `.pi/lib/tools/pty-runner.py` | Fixed in review follow-up; see code/tests and validation below. |
| 3 | `.pi/lib/runtime/trebol-shortcut.ts` | Lease is added synchronously immediately before returning the disposer, with no intervening throwing operation. Documented required shutdown release; idempotent release and overlapping owner tests already cover lifetimes. |
| 4 | `.pi/lib/runtime/trebol-shortcut.ts` | Deferred wider typing of host prototype shape: structural compatibility checks and real-host reload tests remain authoritative. Changing a public host adapter to a falsely narrow interface is not a runtime fix. |
| 5 | `.pi/lib/runtime/trebol-shortcut.ts` | Intentional cooperative patch behavior: do not overwrite another extension. Empty owners render this wrapper inert. Reacquisition works when that wrapper remains in the chain; arbitrary replacement cannot be safely inferred. Existing layered-patch test protects this. |
| 6 | `.pi/lib/context/mermaid-followup.ts` | Source paths in model-facing prose intentionally name repository files. They were updated with the move map and are covered by mermaid-followup tests; no runtime alias introduced. |
| 7 | `.pi/lib/runtime/swarm-builtin-hooks-runtime.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 8 | `.pi/lib/runtime/hook-correction.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 9 | `.pi/lib/runtime/hook-correction.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 10 | `.pi/lib/ui/bootstrap-settings.ts` | Installed Pi has no public native settings-registration API. Preserve existing UI with shape guard and owned cleanup; do not silently delete a feature or mutate host files. |
| 11 | `.pi/lib/ui/bootstrap-settings.ts` | Cleanup already re-reads list.items and list.filteredItems. Added explicit invariant comment; disposal test asserts existing list cleanup. |
| 12 | `.pi/lib/tools/swarm-goal.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 13 | `extensions/annoyed/index.ts` | No issues found; acknowledged. |
| 14 | `.pi/lib/runtime/bootstrap-dispatch.ts` | Kept separate: handoff is one name/owner replacement while hooks preserve ordered multiple registrations. A generic registry would obscure their different contracts. |
| 15 | `.pi/lib/runtime/bootstrap-dispatch.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 16 | `.pi/lib/runtime/agent-settled.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 17 | `.pi/lib/runtime/agent-settled.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 18 | `extensions/cache-telemetry/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 19 | `extensions/autogenskills/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 20 | `extensions/control-task-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 21 | `extensions/control-task-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 22 | `extensions/control-task-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 23 | `extensions/control-task-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 24 | `extensions/conversation-metrics/index.ts` | No issues found; acknowledged. |
| 25 | `extensions/jev-knowledge-audit/index.ts` | No issues found; acknowledged. |
| 26 | `extensions/memory-maintenance/extension.ts` | Relative source imports are the documented jiti/no-build extension contract. TS aliases alone do not resolve in Pi. Move rewriter and actual-host loading validate these paths. |
| 27 | `extensions/mcp-fallback/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 28 | `extensions/mcp-fallback/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 29 | `extensions/mcp-fallback/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 30 | `extensions/mcp-fallback/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 31 | `extensions/prompt-context-configure/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 32 | `extensions/swarm-context/index.ts` | No issues found; acknowledged. |
| 33 | `extensions/swarm-agent-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 34 | `extensions/swarm-agent-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 35 | `extensions/swarm-disk-hooks/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 36 | `extensions/swarm-monitor/extension.ts` | No issues found; acknowledged. |
| 37 | `extensions/swarm-prompt/extension.ts` | Concrete source path is intentional prompt guidance; maintained by move map and prompt tests. No runtime dependency on a prose path. |
| 38 | `extensions/swarm-auto/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 39 | `extensions/swarm-auto/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 40 | `extensions/swarm-update/extension.ts` | Exact package-relative version path is now regression-tested against root package.json. Walking ancestors risks adopting an unrelated package; not changing the identity contract in this review. |
| 41 | `extensions/system-inspector/extension.ts` | Raw manifest paths are a valid diagnostic fallback, not an error. Inspector reports the manifest entry even for nonstandard paths rather than hiding it. |
| 42 | `.pi/lib/runtime/hook-state.ts` | Not a leak caused by session cycling: registration occurs in factories, and same API native handlers persist across sessions too. Clearing owned definitions on shutdown would lose native/manual parity on restart. Repeated registerHook calls intentionally create distinct native and fallback handlers; existing isolation tests verify multiplicity and shutdown removal. |
| 43 | `.pi/lib/runtime/hook-state.ts` | Intentional fail-closed boundary. Missing session identity must never execute another session’s handlers. Handoff checks registration first; supervisor catches refusal. Existing missing-session test protects this. |
| 44 | `packages/tools/agents/src/index.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 45 | `extensions/swarm-history-vault-tools/extension.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 46 | `tools/e2e/auto-boundary.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 47 | `tools/e2e/auto-boundary.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 48 | `tools/e2e/auto-boundary.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 49 | `tools/experiments/jev-audit/task-enforcement-smoke.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 50 | `tools/e2e/trebol-toggle.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 51 | `tools/experiments/memory-retrieval/live-five.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 52 | `tools/experiments/jev-backfill/repair_staged.ts` | Fixed in review follow-up; see code/tests and validation below. |
| 53 | `tools/install/check-load.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 54 | `tools/experiments/memory-retrieval/live-answer.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 55 | `tools/experiments/memory-retrieval/live-answer.mjs` | Implementation-level isolated retrieval experiments intentionally bypass toggle wrappers; production load/index/toggle paths have separate real-host tests. Documented this distinction in both scripts. |
| 56 | `tools/install/extension-inventory.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 57 | `tools/install/extension-inventory.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 58 | `tools/install/extension-inventory.mjs` | Style-only request: script remains bounded and tested through actual-host parity checks; avoided broad reformat churn while addressing correctness and argument validation. |
| 59 | `tools/install/extension-inventory.mjs` | Actual-host matching parity check is rerun; mismatch rejection additionally exercised during review validation. Not claiming a unit-test-only proof of real loader behavior. |
| 60 | `tools/install/package-sources.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 61 | `tools/install/package-sources.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 62 | `tools/install/package-sources.mjs` | Finding factually incorrect: tests/install-package-sources.test.ts is in this PR. Added git+ URL and managed-clone cases in tests/install-review.test.ts. |
| 63 | `tools/install/pi-host.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 64 | `tools/install/pi-host.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 65 | `tools/install/pi-host.mjs` | Finding factually incorrect: tests/install-pi-host.test.ts is in this PR covering symlink resolution, explicit executable, missing executable and missing SDK. Added Windows suffix coverage. |
| 66 | `tools/install/migrate-extension-paths.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 67 | `tools/install/migrate-extension-paths.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 68 | `tools/install/doctor.mjs` | Fixed in review follow-up; see code/tests and validation below. |
| 69 | `tools/install/doctor.mjs` | Fixed in review follow-up; see code/tests and validation below. |

## Validation

- `npm run build`: passed.
- `TMPDIR=/private/tmp npm test`: 871 passed, seven skipped, no failures.
- Real-host public-surface parity: passed; deliberately changed baseline rejected.
- Real-host auto continuation, toggle/reload, and task-enforcement recovery: passed.
- Windows suffix handling has unit coverage; no Windows machine execution claimed.
- Historical model/provider experiments were path-corrected, not run against paid providers or real stores.
