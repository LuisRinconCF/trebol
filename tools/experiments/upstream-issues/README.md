# Open GitHub issues Codemode script

`list-open-issues.codemode.js` fetches the current repository's open issues with `gh`, extracts any reported Scope/Triage fields, retains a bounded excerpt of each issue body, stores the result in the Pi Codemode session store, and returns all entries. It does not modify or close issues. Treat issue descriptions as unverified reports.

Run in Pi Codemode from a checkout with GitHub CLI authentication:

```js
// Paste the contents of list-open-issues.codemode.js into codemode.
```

Requires `gh auth status` to succeed and the current repository to resolve via `gh repo view`. The script requests up to 1,000 open issues; GitHub CLI returns the matching open issues up to this limit. To inspect stored results in a later Codemode call, use `load("upstream_open_issues")`.
