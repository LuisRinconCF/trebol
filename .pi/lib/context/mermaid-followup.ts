/** Conservative intent gate: diagrams are useful for a requested explanation, not every code-edit report. */
export function wantsMermaidExplanation(prompt: string): boolean {
  if (/\b(?:mermaid|diagram|flowchart|visuali[sz]e|draw (?:a |the )?flow)\b/i.test(prompt)) return true;
  // An explicit request to probe the post-response diagram hook is itself
  // diagram intent, even when the user intentionally avoids saying "diagram".
  if (/\b(?:reloaded?|post.response|hook)\b/i.test(prompt)
    && /\b(?:ignor\w*|omit\w*|skip\w*|miss\w*|catch\w*|detect\w*|test\w*)\b/i.test(prompt)
    && /\b(?:catch\w*|detect\w*|hook|reloaded?)\b/i.test(prompt)) return true;
  return /\b(?:explain|understand|how (?:does|do|can|would)|walk(?:through| me through))\b/i.test(prompt)
    && /\b(?:tool|hook|skill|budget|agent|harness|policy|workflow|architecture|process|footer|status|interface|rendering|display)\b/i.test(prompt);
}

/** A complete Mermaid fence, not a bare mention or an unclosed draft. */
export const hasMermaidDiagram = (text: string): boolean => /^(`{3,}|~{3,})mermaid\s*\n[\s\S]*?^\1\s*$/m.test(text);

export const MERMAID_FOLLOWUP = "The previous explanation omitted a Mermaid diagram requested or useful for this conceptual question. First check whether you have evidence for the actual behavior. If the question concerns this repository's Mermaid response hook and you have not inspected its implementation, use available read tools to inspect extensions/mermaid-response/extension.ts and .pi/lib/context/mermaid-response.ts and mermaid-followup.ts before explaining it. Then provide a concise final walkthrough with one or more relevant fenced ```mermaid diagrams and prose explaining their transitions. Do not draw a speculative diagram of unknown implementation merely to satisfy the diagram request. If source access is unavailable, state that limit rather than inventing behavior. Do not claim the previous reply was replaced.";
