# History search correctness audit

## Scope and method

Read root `AGENTS.md` (repository operating contract; notably tool registrations live under `.pi/extensions/<layer>`, and `.pi/lib` contains shared helpers). Inspected `.pi/lib/tools/swarm-history-tools.ts`, its public contracts in `.pi/lib/tools/swarm-history-tools.contract.ts`, registration in `extensions/swarm-history-vault-tools/extension.ts`, and the separate legacy `history_search` registration/engine in `extensions/history-search/extension.ts`. Findings below are static code review unless explicitly marked otherwise. No actual session/history files were read and no synthetic runtime probe was run.

## Findings

### Medium — HistoryGet can return an unredacted persisted title

`historyGet` cleans content before passing it to `fitRow`, and `fitRow` includes tool payloads only when `humanOnly` is false. However title metadata is constructed from `header.name` using `cleanHistoryText`, not `redact`; if the persisted session title contains a secret assignment or bearer credential, it is returned verbatim. The concrete defect is persisted title: `.pi/lib/tools/swarm-history-tools.ts:191-193` returns title without `redact`, whereas message text is redacted at `:350` and nested tool payloads at `:340-345`. **Severity: Medium** (secret disclosure if a title contains credentials). Static finding; no secret fixture used.

### High — HistorySearch returns unredacted persisted titles/previews and matched segments

Search constructs title/preview/body from raw stored messages (`:149-162`); runtime cleaning is conditional and does not redact secrets (`:268-270`). Results return title/preview/snippets (`:294-297`), and segment search returns matched text (`:336`) with `compactTitle` performing cleanup only (`:71`). The redaction helper is only used in HistoryGet serialization (`:43`, `:340-354`). A stored API key/bearer token in a user message, tool result, title, or snippet can therefore be exposed by HistorySearch. **Severity: High** because this is model-facing history disclosure and users may reasonably rely on the redacted contract. Static finding; no sensitive data or history scanned.

### Medium — `human_only` does not remove assistant runtime/scaffolding content

Contract says human-only excludes system/tool messages and machine-only reminder boilerplate (`.pi/lib/tools/swarm-history-tools.contract.ts:11`), but implementation retains all assistant messages and only filters empty/non-substantive *user* messages (`swarm-history-tools.ts:386-388`). Runtime text in assistant messages can pass unchanged; `cleanHistoryText` is applied only to the retained content and removes recognized blocks/prefixes incompletely (`:30-35`). **Severity: Medium**; option's privacy/filtering promise is broader than behavior. Static finding.

### Medium — segment mode silently ignores fields/search_body after validation

Any segment filter or stats switches to `segmentSearch` after general fields validation, but segment matching always searches every segment (`:301-325`) and never applies `fields` or `search_body`. Thus `fields:["title"]` with `tool_name` still matches tool segments, and `search_body:false` does not suppress message segments. The public contract presents fields/search_body as general HistorySearch controls (`contract.ts:5-6`) while segment options say they filter matches (`:6`). **Severity: Medium**; filters can produce surprising/disallowed matches and leak more content than requested. Static finding.

### Medium — regex “RE2” claim does not prevent catastrophic backtracking

`regexFor` blocks lookaround and numeric backreferences then passes remaining user patterns directly to JavaScript `RegExp` (`swarm-history-tools.ts:224-229`). JavaScript supports backtracking constructs such as nested quantifiers, unlike Go RE2. Applied to potentially very long session fields (`:268-278`) this permits regex denial of service. **Severity: Medium** (runtime stall under crafted regex/history). Static finding; no pathological probe executed.

### Pagination note — max_chars can reduce rendered page size, but is marked

`loadSessionForGet` reads the requested offset window (`:181-184`); serialization walks newest-to-oldest and may stop when a row exceeds remaining budget (`:383-392`). The response retains requested `window_start/window_end` and marks omitted/truncated (`:393`), so this is bounded rather than silent pagination corruption. `boundedHistoryJSON` then removes leading rows until the complete envelope fits (`:397-415`), incrementing omitted count. No defect identified in stated bounded behavior.

## Correctness notes / unverified areas

- Current-workspace isolation is exact resolved-path equality for both search and get (`swarm-history-tools.ts:243-248,263,359-368`); all-workspaces is opt-in.
- Search retains entire files and parsed entries/messages (`:119-161`). Normal discovery supplies a 1000-file/50 MiB-per-file cap but no aggregate working-set cap; the fallback removes those discovery caps. See the resource audit for severity and measurements.
- `origin` is schema-supported but Pi cannot persist it (source header comment lines 4-6); validation exists (`:262`) but no origin filter is applied. Calls with any allowed origin therefore return unrestricted results. **Severity: Medium contract mismatch** unless explicitly documented as unsupported/no-op.
- Search `exclude_runtime` affects only body, not title/preview (`:268-270`); this may be correct for metadata but is narrower than the contract wording “ignore runtime-injected pseudo-messages when matching message bodies.”
- `tool_outcome` filtering excludes non-tool-result segments (`:309-312`), correctly matching its description.
- The standalone `history_search` engine has its own schema and redaction (`extensions/history-search/extension.ts:34-39,95`). Its `read` checks realpath containment (`:77-81`), but its hit accumulation and per-file JSON accumulator are not bounded by result limits (`:71-91`).

## Verification

Static review only. No production files changed. No tests or history-backed probes were run; in particular, no actual history was scanned.
