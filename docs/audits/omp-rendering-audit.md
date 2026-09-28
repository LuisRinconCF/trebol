# Oh My Pi vs Pi-Swarm tool rendering and styling audit

## Scope and method

The user asked for a verbose, granular comparison of Oh My Pi (OMP) rendering/custom styling against Pi-Swarm, tool by tool, with VHS side-by-side examples. This audit examines renderer contracts and source; it is not a claim that every implementation has been launched interactively. We group only where the implementation uses the same renderer and still list individual families/tools. Observations are source-backed; recommendations are labeled separately.

## Baseline

- OMP source: vendored `vendor/oh-my-pi`, Git revision `daf07999c2fee9b22edc7bf8fea1fb6272e0df5e`; package catalog marks the 18.1.14 family (`vendor/oh-my-pi/package.json`).
- OMP renderer registry and contract: `vendor/oh-my-pi/packages/coding-agent/src/tools/renderers.ts`, `vendor/oh-my-pi/docs/tui.md`.
- Pi-Swarm local renderer inventory: `.pi/extensions/` registrations, `packages/tools/`, `.pi/lib/ui/`, and `packages/runtime/core/src/tool-renderer.ts`.
- VHS fixture: `docs/audits/omp-rendering-vhs.tape`; output `docs/audits/omp-rendering-vhs.gif`. It is an illustrative mocked card with matched 1000×600 Dracula terminal, not a live capture from both applications. VHS 0.11.0 validated and rendered the tape successfully. Do not infer actual renderer parity from the mock.

## OMP renderer architecture and styling contract

OMP has an explicit built-in registry: Ask, AST grep/edit, Bash, Debug, Eval, Edit/Apply Patch, Glob, Grep, LSP, Hub, Read, Resolve/Reject, Retain/Recall/Reflect, Task, Think, Todo, GitHub, Goal, Web Search, Vibe lifecycle tools, and Write (`vendor/oh-my-pi/packages/coding-agent/src/tools/renderers.ts#L95-L141`). Its `ToolRenderer` owns both `renderCall` and `renderResult`, receives theme and state (expanded, partial, spinner frame), optionally receives args on results, and exposes presentation hints such as inline/merge, activity summary, animation and viewport repaint needs (`.../renderers.ts#L57-L93`).

OMP TUI requires width-aware terminal-safe output: visual-width measurement, ANSI-aware wrapping/truncation, tab sanitization, and immutable/stable component render arrays (`vendor/oh-my-pi/docs/tui.md`, “Core component contract” and “Rendering constraints”). Individual renderers commonly frame output, use semantic theme symbols/status, cache expensive output, and distinguish pending/running/success/error/timeout. Example: OMP Bash call renderer shows pending/running status and expanded command preview; result renderer selects success/error/warning/pending status from partial, error and timeout state and caches output (`vendor/oh-my-pi/packages/coding-agent/src/tools/bash.ts#L1651-L1729`).

## Pi-Swarm shared behavior

`withDefaultToolRenderer` adds a generic `renderResult` when absent; it does not provide a generic `renderCall`. Generic results combine text/image labels, show JSON details when expanded, clip at 20,000 characters, label working/error/done, theme-color errors if possible, and collapse long explicit-renderer output to a five-line tail preview (`packages/runtime/core/src/tool-renderer.ts#L1-L68`). Its fallback wraps by JavaScript string length, not terminal display width; at nonpositive width it returns the source line unchanged (`#L8-L15`). This is a concrete improvement candidate for wide Unicode, ANSI and very narrow terminals.

Pi-Swarm has specialized renderers for bootstrap, TaskManage, ask-user, history search, foreground Bash and background Bash. Most other registered tools are wrapped with the generic fallback. Bootstrap is especially task-aware: it reports stage, progress, mode/model, elapsed time, counts, failures, citations and handoff brief, with collapsed/expanded modes and redaction fallback (`.pi/lib/ui/bootstrap-tool-renderer.ts#L51-L126`, `#L151-L165`). Its visual structure is largely plain text and its component wraps by code-point count rather than terminal display width (`#L129-L143`); call view is only “Bootstrap · scope=…” (`#L151-L156`). TaskManage uses semantic success/warning/error/dim styles and width-limited task rows, supports partial state and parses structured details before text fallback (`packages/tools/taskmanage/src/task-manage.ts#L308-L343`).

## Tool-family comparison

| Pi-Swarm tool/family | Pi-Swarm rendering observed | Closest OMP reference | Difference / gap |
|---|---|---|---|
| Generic fallback: agents, MCP-discovered tools, schedule, context/skill tools, memory-history, research/search, vault, codemode and similar registrations | Result-only generic renderer; errors colored if theme supports it; generic partial/done state; details only expanded; five-line tail collapse only wraps explicit result renderers. | OMP per-tool renderer registry and result/call contract | High-level breadth gap: OMP presents many built-ins with semantic call and result renderers; Pi-Swarm mostly displays generic text. Not every custom tool has a true OMP equivalent. Generic renderer does not provide call-state detail. |
| Foreground Bash (`swarm_bash`) | Dedicated call/result presentation; command, output and state surfaced with theme styling. | OMP Bash | Closest parity among tool families. Compare state/error/timeout/collapse and visual-width behavior in live VHS follow-up; avoid claiming exact parity from source alone. |
| Background Bash (`swarm_background_bash`) | Specialized renderer communicates background execution/result. | OMP Bash plus asynchronous lifecycle (not exact equivalent) | OMP’s Bash renderer is richer in pending/running/result status, but OMP has no exact equivalence established for Pi-Swarm background semantics. Compare as distinct UX. |
| Bootstrap | Stage bar, progress/count metrics, mode/model/elapsed, failure list, optional citations and handoff; explicit collapsed/expanded brief. | OMP tool status/card patterns, not an equivalent tool | Rich domain information, but plain text, limited semantic color/theme use, comparatively bare call, and code-point wrapping. There is no one-to-one OMP bootstrap renderer. |
| TaskManage | Structured tasks/questions/errors; status icons, semantic colors, partial placeholder, width-aware truncation. | OMP task/todo/goal renderers | Similar task-oriented semantics, but schema/interaction differs; compare lifecycle states and hierarchy details rather than assume identical content. |
| Ask-user UI | Dedicated custom call/result and interactive UI renderer in `.pi/extensions/30-tools/ask-user/index.ts#L2372-L2390`; tool interaction is richer than static output. | OMP Ask renderer and extension custom UI contract | Compare keyboard/focus/overlay lifecycle separately from transcript card. No evidence here of matched interactive screenshots. |
| History search | Custom call/result; expanded mode formats details. | OMP search/Read renderer only as analog | Pi-Swarm history operations (search/read/json search) are domain-specific; generic or custom output should prioritize match snippets, provenance, and bounded previews. |
| Remaining Pi-Swarm custom tools without dedicated renderer | Generic result renderer, often no call renderer. | OMP per-built-in registry | These are the largest consistency opportunity: success/error/partial/default styling and actionable summaries vary less than OMP’s specialized renderers. Inventory names are defined in `AGENTS.md#Extension inventory`. |

## Feature-by-feature findings

| Dimension | OMP | Pi-Swarm | Evidence-based assessment |
|---|---|---|---|
| Call preview | Required call/result renderer contract; per-tool summaries and status possible. | Only tools that define `renderCall` show specialized calls; generic wrapper does not add one. | Gap: tool identity/important arguments may be less visible for generic tools. |
| Partial/streaming | `isPartial`, spinner frame, per-renderer animation hints; Bash reflects pending/running. | Generic fallback says working/ellipsis; Bootstrap has event-derived progress; TaskManage has “Managing tasks…”; Bash specialized. | Mixed: specialized tools can be informative; fallback offers little progress detail. |
| Success/error/timeout | Tool-specific semantic status, symbols and theme APIs; Bash distinguishes timeout. | Generic fallback marks errors, TaskManage status colors, Bootstrap success/degraded/cancelled/failed. | Strong error state exists selectively; timeout and nuanced completion semantics should be consistent per family. |
| Collapsed/expanded | Renderer chooses previews and framing with shared expanded state; contract includes UI repaint semantics. | Shared wrapper collapses long renderer output to five final lines; Bootstrap has explicit content policies; generic fallback exposes details only expanded. | Pi-Swarm’s generic tail can omit a useful beginning/header; explicit renderers may provide better control. |
| Theme/custom styling | Semantic theme symbols, colored status, frames/boxes; extensible component contract. | Theme colors in select custom renderers; generic output mostly unstyled; Bootstrap mostly glyphs/text. | Opportunity to make semantic palette and status presentation consistent without copying OMP palette wholesale. |
| Width/Unicode/ANSI | Explicit visual-width and ANSI-safe constraints and utilities. | Generic fallback uses `String.length` slicing; Bootstrap uses `Array.from` code points, not display columns; TaskManage has its own display-width-aware helper. | Concrete reliability gap for emoji/CJK/combining marks/ANSI and narrow widths in generic/bootstrap paths. |
| Performance/caching | Component stability and renderer caches are first-class concerns; Bash documents expensive-output cache. | Generic component is simple dependency-free; specialized components vary. | Potential optimization only after profiling; do not assume current slowdown. |
| Rich content | Built-in specialized renderers transform tool-specific details into structured terminal summaries. | Generic fallback labels images as `[image: mime]`, displays text, expanded JSON details. | Image payload is described, not visually rendered in generic path; specialized summarization would improve high-value tools. |

## Prioritized improvements and acceptance checks

1. **P1 — terminal-width correctness in generic/bootstrap paths.** Replace code-unit/code-point chunking with TUI visual-width-aware ANSI-safe wrap/truncate utilities, sanitizing tabs. Accept when output lines stay within 40/80/120 columns for emoji, CJK, combining marks and ANSI-colored strings; test width 0/1 and ensure no split escape sequence/grapheme.
2. **P1 — generic call preview and state taxonomy.** Provide a standard compact call title with tool label and safe, bounded salient arguments plus consistent pending/running/success/error/partial states; preserve specialized renderer ownership. Accept when a generic tool has a recognizable call row and correct state at partial, success, error and expanded modes without leaking secrets.
3. **P2 — collapsed preview policy.** Prefer header/first useful lines plus tail or tool-specific summary instead of an unconditional last-five-lines tail. Accept with long-output fixtures where collapsed view identifies tool/action and indicates hidden output, and expansion restores complete bounded content.
4. **P2 — shared semantic styling primitives.** Establish consistent title/status/secondary/evidence/error roles using active theme; retain accessible plain-text symbols and avoid hard-coded palette assumptions. Accept by testing at least Dracula and a light theme; status must remain understandable without color.
5. **P2 — bootstrap call/progress visual refinement.** Make current stage and progress changes visually legible, add semantic color where theme is available, and width-fit its long scope/model/failure/citation lines. Keep evidence redaction and no synthetic completion inference. Accept with running/complete/degraded/cancelled/failed fixtures at narrow and normal widths and verify citations/brief expansion.
6. **P3 — per-tool summaries for high-frequency generic families.** Prioritize agents, MCP, schedule, research/search, history and memory operations based on real use. Accept each renderer with representative partial/success/error/expanded fixtures, no secret-bearing argument echoes, and a focused test.

## VHS comparison and limitations

`docs/audits/omp-rendering-vhs.tape` creates `docs/audits/omp-rendering-vhs.gif` using VHS 0.11.0. It displays a static side-by-side card at 1000×600 using Dracula; this is an illustrative composition only, not a faithful runtime renderer capture. The next rigorous visual pass should invoke real OMP and Pi-Swarm renderer harnesses with identical canned arguments/results/status, and capture compact/expanded plus narrow/normal widths. The reference source and theme contracts are available locally; the VHS tape itself must not be cited as proof of runtime visuals.

## Deliverables

- This audit and comparison matrix.
- VHS tape and generated GIF (illustrative, explicitly labeled limitation).
- No production renderer behavior was changed; no test suite was run as part of this audit.
