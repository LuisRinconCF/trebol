# OMP renderer comparison and visual audit plan

## Goal

Compare Oh My Pi (OMP) renderers and styling with Pi-Swarm, one renderer/tool family at a time. Produce a verbose, evidence-backed audit and VHS-generated side-by-side terminal captures. This is an audit/recommendation task, not authorization to make broad renderer changes.

## Scope and baseline

- Reference: vendored `vendor/oh-my-pi` at Git revision `daf07999c2fee9b22edc7bf8fea1fb6272e0df5e`.
- Reference contracts: `vendor/oh-my-pi/docs/tui.md`, `packages/coding-agent/src/tools/renderers.ts`, individual renderer source files and tests.
- Subject: Pi-Swarm tool renderers registered in `.pi/extensions/`, `packages/tools/`, and shared default renderer `packages/runtime/core/src/tool-renderer.ts`; include the specialized Bootstrap renderer.
- Compare call, partial/streaming, successful result, error, collapsed/expanded output, width handling, semantic color/theme use, and exceptional content (long text/images/ANSI) where applicable.
- User explicitly requests verbose treatment and VHS side-by-side comparisons.

## Execution choreography and dependencies

1. Read repository rules and establish a cleanly bounded, read-only comparison surface. Preserve all pre-existing user changes. Inventory registered tools and renderer ownership; group tools by actual shared renderer (generic fallback, Bash, background Bash, Bootstrap, TaskManage, history, ask-user, etc.). **Depends on current worktree inspection.** Output: complete inventory with source paths; explicitly mark tools with no dedicated renderer.
2. Extract OMP contracts and renderer behavior from the pinned vendored source. Build a mapping from OMP built-ins to comparable Pi-Swarm tool families; distinguish non-equivalent tools rather than forcing pairings. **Depends on step 1.** Output: versioned reference behavior, themes/states/widths, precise source citations.
3. Inspect Pi-Swarm renderer implementations/tests and theme APIs. For every family, record call/result/partial/error/expanded styling, wrapping/truncation, visual width and ANSI behavior, color semantics, and notable limitations. **Can proceed in parallel with step 2 once inventory is known.** Output: evidence-based comparison matrix.
4. Create reproducible VHS scripts that render stable representative scenarios on both sides in matched terminal dimensions and theme conditions. Prefer project-local harnesses or deterministic fixtures; do not run interactive external operations. If OMP cannot be run as an executable due to build/runtime prerequisites, first attempt the source-backed renderer harness; disclose any remaining limitation and use identical labeled text fixtures only as a fallback, never claim they prove live rendering. **Depends on steps 2–3.** Output: paired GIF/PNG artifacts plus scripts/tapes and exact commands.
5. Review every comparison for parity of input scenario, dimensions, theme, status, and renderer state. Separate directly observed differences from recommendations. Rank gaps by user impact, implementation effort/risk, and confidence; state an acceptance check for each recommendation. **Depends on steps 2–4.** Output: verbose audit with tool-by-tool rows and prioritized improvements.
6. Verify documentation/artifact links, VHS reproducibility where feasible, and repository diff/status without overwriting existing work. Complete task questions with evidence references. **Depends on all prior steps.**

## Expected deliverables

- A detailed audit under `docs/audits/` with scope, baseline/version, methodology, feature-by-feature OMP vs Pi-Swarm matrix, tool-family-by-tool-family findings, caveats, and prioritized acceptance criteria.
- VHS tape/script(s) and side-by-side visual artifacts under a clearly named audit artifact directory.
- No production renderer changes unless audit reveals a narrowly scoped, separately approved follow-up.

## Breaking points and mitigations

- OMP/Pi-Swarm tools do not map one-to-one: maintain a mapping table and label non-equivalent tools.
- Vendored source may be locally modified: pin the commit and inspect status/diff before relying on it.
- VHS may need dependencies or terminal recording support: check exact help/version and test a minimal tape; document blockers rather than fabricating screenshots.
- Deterministic test rendering may diverge from runtime integration: prioritize actual app invocation or renderer-backed harnesses and label fidelity level.
- Terminal widths/Unicode display width/ANSI styling can invalidate apparent parity: use matched widths and inspect visual-width-aware behavior; compare both normal and narrow widths.
- Theme names differ: compare semantic roles where possible and disclose theme mapping; do not compare unrelated palettes as renderer-quality evidence.
- Existing worktree contains unrelated edits/untracked assets: do not clean/reset or modify them; constrain changes to new audit-owned paths.
- Large renderer/tool inventory risks shallow coverage: report every registered tool mapping even if variants are grouped; explicit per-tool coverage table prevents silently skipped tools.

## Impact/ripple analysis

This plan is documentation and test-artifact focused. Inspecting runtime and renderer code should not alter tool execution, model-facing schemas, extension registration, session state, or shared/vendor source. New VHS scripts must be read-only and use canned fixtures. Any later code change would affect Pi's `renderCall`/`renderResult` path and needs its own scoped patch and regression tests; it is out of scope here.
