# Mermaid follow-up: live eligibility verification

## Current session observation (before eligibility change)

Read the active Pi session JSONL at `/home/swarm/.pi/agent/sessions/--home-swarm-Work-Pi-Swarm--/2026-09-23T21-34-54-068Z_01a0d031-6873-7218-b9e7-18b810be771b.jsonl` as structured records, not by searching raw tool output. User record `54d4c1c1` says “I reloaded you try to ignorre it and see if it catches you”; separate user record `ef9e69ae` says “continue”; final assistant record `60d4666e` is a 756-character diagram-free explanation. No `pi-swarm-mermaid-followup` custom entry occurred between these messages or following that answer in the inspected branch. The old intent matcher returned false for both user strings. This observation establishes the omission, not whether an unrelated hook event was emitted.

## Isolated real-host retest (after eligibility change)

Run `node tools/experiments/jev-audit/mermaid-followup-smoke.mjs`. The probe launches the installed `pi` executable with only the Mermaid extension, a local deterministic SSE provider, and separate temporary session directories. It parses persisted JSONL *assistant message content* and the provider's second request before asserting outcomes; no production session is modified.

| Scenario | Provider calls | Persisted assistant messages | Follow-up | Generated diagram |
| --- | ---: | ---: | --- | --- |
| Conceptual request, diagram missing | 2 | 2 | yes | yes |
| Diagram already present | 1 | 1 | no | n/a |
| Routine test update | 1 | 1 | no | n/a |
| Follow-up still missing diagram | 2 | 2 | yes, once | no |
| Exact reload-test wording | 2 | 2 | yes | yes |

In the reload-test case, observed `message_end` roles were `system,user,assistant,custom,assistant`; the second provider request contained the Mermaid follow-up prompt, and persisted history retained both exact assistant texts plus the hidden custom message. The first failed smoke run used `saved.includes(fullText)` against JSON-escaped session lines; reading parsed assistant content corrected the *probe*, not the hook. A later failed run expected a diagram only for the conceptual case and overlooked the scripted reload-test diagram; its assertion was corrected and the same host test passed.

Focused `npx vitest run .pi/test/context/mermaid-followup.test.ts` passed 3/3. An `npm test` run had 823 passing tests and one failing `packages/tools/taskmanage/test/task-hooks.test.ts` web_search exemption assertion; a concurrent change removed `websearch` from `RESEARCH_TOOLS` in that package. That failure is outside this Mermaid change and also reproduced in a focused run. `git diff --check` passed. The modified hook has **not** been reloaded into the interactive session from the first observation; the isolated installed Pi run proves the new code path, not a second observation of that already-running interactive session.
