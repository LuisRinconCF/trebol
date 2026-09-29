/** Model-facing contracts for the tools registered by this module. */
import type { ToolContract } from "../runtime/tool-contract.ts";

export const ANNOYED_CONTRACT: ToolContract = {
  description: "Publish an actionable product-friction report after one isolated tool-less ownership consultation. Trebol-owned harness defects route to cloverinternational/trebol; project defects route only to a host-verified active-project GitHub repository. Upstream, non-actionable, uncertain, missing-remote, and judge-failure submissions go to explicit Trebol triage. The transcript remains local and is never published. Cancellation prevents starting another GitHub write; a previously dispatched request may have succeeded and requires receipt reconciliation. Use once with concrete observed/expected behavior, bounded non-secret evidence and objective acceptance tests. Do not turn automatic failure nudges into reports of every failure.",
  parameters: {"properties":{"acceptance_tests":{"description":"Objective tests that a fix must pass","items":{"type":"string"},"type":"array"},"category":{"description":"Defect class: hook_false_positive, tool_failure, inefficiency, misleading_error, missing_capability, or other","type":"string"},"evidence":{"description":"Bounded, non-secret evidence such as the tool, error class, and reproduction shape","items":{"type":"string"},"type":"array"},"expected":{"description":"What should have happened instead","type":"string"},"issue":{"description":"A brief description of the issue, bug, inefficiency, or frustration","type":"string"},"observed":{"description":"What concretely happened; state the mechanism, not a vibe","type":"string"},"severity":{"description":"Severity: low, medium, or high","type":"string"}},"required":["issue"],"type":"object"},
};

export const CONTRACTS: Record<string, ToolContract> = {
  annoyed: ANNOYED_CONTRACT,
};
