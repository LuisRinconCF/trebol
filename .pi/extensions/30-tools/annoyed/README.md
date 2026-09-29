# Annoyed — local product-friction board

The `annoyed` tool records a user-approved report locally and routes it to GitHub after one isolated, tool-less ownership judge. Trebol-owned harness reports go to `cloverinternational/trebol` by default; set `SWARM_ANNOYED_REPOSITORY=owner/repository` to override that harness destination. `SWARM_ANNOYED_JUDGE=provider/model` optionally overrides the session model used by the judge. The judge cannot choose a destination or invoke tools.

Project reports use the active `ctx.cwd` origin only after GitHub remote-form validation and `gh repo view` identity verification. A missing, non-GitHub, or unverifiable project remote routes to Trebol triage. Upstream, non-actionable, uncertain, malformed, and failed judge outcomes also go to explicit Trebol triage; cancellation stops before publication. Automatic failure nudges remain unchanged and are not converted into reports of every failure.

The local SQLite board remains at `~/.pi/annoyed/annoyed.sqlite`, with JSON export at `~/.pi/annoyed/issues.json`. Reports are fingerprinted by project identity. Metadata records the judge verdict, destination, stable report marker, and publication receipt state: `reserved`, `posting`, `confirmed`, or `unresolved`. Confirmed receipts are reused; unresolved outcomes are not blindly posted again. SQLite cannot transact atomically with GitHub, so this is a safe-retry boundary, not an exactly-once guarantee. The transcript remains local; public report fields are bounded and redacted, and public bodies omit local paths.

Commands: `/annoyed`, `/annoyed all`, `/annoyed backlog`, `/annoyed move <id> <status>`, and `/annoyed read <id>`. Node's built-in `node:sqlite` requires Node 22.5+.

## Recovery limitations

The SQLite unique fingerprint reserves a new report before its judge runs; concurrent
duplicates are refused, not independently judged. Confirmed receipts are reused.
Posting/unresolved receipts can reconcile an exact marker across all-state GitHub
issue pages (including closed issues); a missing/non-unique marker remains unresolved
and is never blindly reposted. A gracefully cancelled consultation saves an
uncertain verdict and marks its reservation `ready`; a later explicit submission
claims that state atomically and routes to triage without consulting again.
A crashed process leaves its reservation blocked for manual review; automatic
crash takeover is not implemented because another process could still be judging.
Cancellation cannot undo an already dispatched GitHub POST. Remote resolution and
GitHub execution are bounded; the one-shot consultation uses the shared 30-second
timeout. Structured report fields, not arbitrary private prose, are published after
credential/path redaction; redaction cannot identify every possible secret.
