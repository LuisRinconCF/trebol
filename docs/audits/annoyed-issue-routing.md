# Annoyed issue ownership routing audit

Audit date: 2026-09-28. This routing guide is paired with the complete repository-specific inventory in [annoyed-issue-inventory.md](annoyed-issue-inventory.md). No GitHub mutations were made.

## Scope and method

The audited repository is [cloverinternational/trebol](https://github.com/cloverinternational/trebol), verified with `gh repo view`. Its full all-state issue listing was requested through `gh api --paginate 'repos/{owner}/{repo}/issues?state=all&per_page=100'`. The successful response contained 15 records, all with `pull_request` fields; these are excluded. The included issue count is therefore zero. See the companion inventory for the complete excluded PR listing, counts, and limitations.

This is a separate repository inventory from the historical `Swarm-Code/mono` artifact documented in the companion inventory. The Trebol endpoint returned no issue records (15 PRs excluded); the mono artifact contains 916 annoyed-format reports. Do not combine those denominators or transfer mono ownership findings to Trebol. This document does not establish any individual Trebol issue report because there were no issue records in the returned result.

## Routing policy

For submitted annoyed-format reports, Trebol's destination is **triage**, including reports whose eventual implementation owner is elsewhere and reports judged non-actionable. Triage publication is not a finding that Trebol should implement a fix. Mark unresolved/upstream reports and non-actionable reports as outside Trebol implementation scope, while retaining them in triage rather than dropping them.

When implementation scope is assessed, use these distinctions:

1. **Trebol implementation scope** — evidence points to a defect in this repository's Swarm-owned implementation, integration, docs, or configuration.
2. **Current project implementation scope** — evidence points to the user's affected project/application rather than this harness.
3. **Other/upstream implementation scope** — evidence points to Pi-native behavior, an external host/tool/runtime, or another repository's code. Keep in Trebol triage; flag outside Trebol implementation scope and route attribution remains provisional unless the report establishes it.
4. **Non-actionable or unresolved** — no actionable defect is demonstrated, the report is an agent/user command error, expected constraint, or evidence is insufficient. Keep submitted reports in Trebol triage; flag outside implementation scope when no Trebol-owned fix is established. Preserve uncertainty rather than forcing an owner.

For the *separate mono historical dataset*, use the companion inventory's report-context classifications as provisional routing candidates, not confirmed Trebol ownership. Harness mechanisms (TaskManage, vault tools, skill/tool-budget gates, `ask_user_question`, `apply_patch`) belong to the harness boundary based on the reported API and failure mechanism, even when reports are filed in historical Swarm-Code/mono. Generic defects in mono's application/code are not automatically Trebol defects. Environment/toolchain-only blockers and external browser behavior remain outside Trebol; agent/user command mistakes are non-actionable. The 901 readable reports received bounded complaint/observed/expected/evidence review; 15 encrypted reports remain uncertain. No category proves implementation owner or reproduction.

Classification is a reasoned routing judgment based on report context and repository boundaries, not independent reproduction. Reporter-supplied category/severity is not proof. Do not copy transcripts into audit docs. Reassess if new evidence or reproduction changes attribution.

## Audited results

The companion inventory records 916 mono-format reports (901 readable, 15 encrypted), with reconciled provisional counts: 463 harness candidates, 1 Trebol documentation candidate, 69 environment, 134 external/upstream, 18 non-actionable, 216 readable uncertain, and 15 encrypted uncertain (916 total). #184 vault_add and #218 TaskManage are harness candidates because their report evidence describes explicit Swarm tool schema/behavior; neither is confirmed Trebol-owned. #1058 cites this checkout's AGENTS.md and missing npm script and is a Trebol-docs candidate, but origin/current ownership is unverified. Other bounded examples include #1060 TaskManage, #1037 choice schema, #1029 tool-budget, #997/#996 non-actionable, #1030 Go toolchain, and #1012 external `agent-browser`. These are routing judgments, not reproduced defects or source-history proof. The separate Trebol API result remains zero issues and 15 PRs excluded; do not conflate those counts with mono.
