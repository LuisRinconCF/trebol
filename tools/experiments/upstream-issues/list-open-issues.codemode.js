// Pi Codemode script: enumerate and compactly summarize all open issues for
// the current GitHub repository. Requires gh auth and tools.bash.
// Run from the repository and review the output; this is triage assistance,
// not a verification that issue claims are true.
const limit = 1000;
const result = await tools.bash({
  command: `gh issue list --state open --limit ${limit} --json number,title,body,url,labels,assignees,createdAt,updatedAt`,
});
if (result.isError) throw new Error(result.content?.map(x => x.text || "").join("\n") || "gh issue list failed");
const raw = result.content?.map(x => x.text || "").join("\n") ?? result.output ?? "";
const issues = JSON.parse(raw);
const rows = issues.map(issue => {
  const body = issue.body || "";
  const scope = body.match(/\*\*Scope:\*\*\s*([^\n]+)/i)?.[1]?.trim() || "unspecified";
  const triage = body.match(/\*\*Triage:\*\*\s*([^\n]+)/i)?.[1]?.trim() || "untriaged";
  const labels = (issue.labels || []).map(label => label.name);
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    scope,
    triage,
    labels,
    updatedAt: issue.updatedAt,
    body: body.slice(0, 1600),
  };
});
store("upstream_open_issues", rows);
return {
  repository: (await tools.bash({ command: "gh repo view --json nameWithOwner --jq .nameWithOwner" })).output?.trim(),
  openIssueCount: rows.length,
  issues: rows,
};
