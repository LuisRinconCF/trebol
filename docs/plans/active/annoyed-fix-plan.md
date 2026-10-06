# Annoyed issue fixes plan

## Scope
Fix issue #38 in TaskManage validation-error decoration on `feat/annoyed-triage-fixes-20260930`. Initial status: clean worktree; branch verified. Do not edit outside this isolated worktree or touch vendor/GitHub. Write this plan before implementation edits.

## Inputs / output
Input is malformed or valid TaskManage parameters rejected by `swarmValidateTaskManageParams`; the primary validation message remains the thrown error. Additive `details.batch.results` should describe operation-level failure only when an operations array exists; malformed non-array operations must not throw during decoration. Preserve current failed/skipped behavior for valid arrays.

## Invariants
- Never replace/mask the primary validation error with a decoration exception.
- Never invoke array methods on unvalidated `operations`.
- Preserve the original validation message and array decoration semantics.
- No unit tests created or run; verify via build/typecheck or an end-to-end/manual path and `git diff --check`.
