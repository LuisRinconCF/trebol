# Annoyed routing end-to-end verification

Run `node tools/experiments/annoyed-routing-e2e.mjs` from the repository root.
The runner executes the real installed Pi CLI with this checkout's annoyed
extension, a local scripted model provider, isolated HOME/store/session directories,
real temporary Git workspaces and a recording fake `gh` executable. No real GitHub
mutation or paid provider call is needed. Teardown kills live children and removes
the temporary root.

## Observed results

2026-09-28 verification: command exited 0; summary `PASS`, 14 scenarios,
including two simultaneous Pi processes sharing one publication.

Passed flows: harness -> Trebol, HTTPS and SSH project remotes -> verified project
repository, uncertain/upstream/non-actionable -> explicit Trebol triage, malformed
judge -> triage, missing remote -> triage, and repeat -> same receipt without
another judge or POST. Two simultaneous Pi processes produce one publication.
Ambiguous POST fixtures use production-style `gh api --paginate --slurp --method
GET ...?state=all&per_page=100` reconciliation: a closed exact-marker issue is
accepted, a near-match refuses blind repost, and a wrong-repository URL is not
trusted. Fixture credentials are redacted; the parent-branch sentinel does not
reach the judge or public body.

## Verification limits

Parent added and executed actual Pi RPC abort during a live judge, then a new
submission against the same workspace/store: cancellation dispatched no POST;
retry used the persisted uncertain verdict without another judge and published
once to Trebol triage. Expanded parent run passed 14 scenarios. Persisted-result
checks establish the closed-marker URL and errors for near-match/wrong URL.
Cancellation during an already-dispatched POST remains outside this fixture.

This scripted provider verifies host routing mechanics, not unscripted judge
accuracy, real GitHub authentication, permissions, or issue creation. Cancellation
after a dispatched POST, crashed-process takeover, and provider timeout are not
covered. Crashed judge reservations require manual review. The full
approved verification matrix remains in `docs/plans/active/annoyed-routing-judge.md`.
No unit tests were added.

The runner also inspects the persisted Pi session for the actual assistant tool
call and result: the closed exact-marker issue must persist its confirmed
`https://github.com/cloverinternational/trebol/issues/7` receipt; a near-match
and an untrusted wrong-repository URL must persist tool errors without either
URL being returned. This asserts the host-visible result in addition to fake-gh
POST/GET shape. Crashed-process restart/takeover remains outside the runner's
demonstrated coverage; graceful RPC cancellation recovery is covered above.
