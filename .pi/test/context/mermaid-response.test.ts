import { describe, expect, it } from "vitest";
import { repairMermaidResponse, validateMermaid } from "../../lib/context/mermaid-response.ts";
import register from "../../extensions/10-context/mermaid-response.ts";

const bad = "```mermaid\nflowchart TD\nA -- > B\n```";
const good = "```mermaid\nflowchart TD\nA --> B\n```";

describe("Mermaid finalized-response repair", () => {
  it("validates and fixes only a single revalidated malformed flowchart arrow", async () => {
    expect(await validateMermaid("flowchart TD\nA -- > B\n")).toBe(false);
    expect(await validateMermaid("flowchart TD\nA --> B\n")).toBe(true);
    expect(await repairMermaidResponse(`before\n${bad}\nafter`)).toBe(`before\n${good}\nafter`);
    expect(await repairMermaidResponse(good)).toBe(good);
    expect(await repairMermaidResponse(await repairMermaidResponse(bad))).toBe(good);
  });
  it("isolates multiple fences and leaves prose, quoted fences and ambiguity untouched", async () => {
    const text = `prose\n~~~~js\n${bad}\n~~~~\n${bad}\n${good}\n\`\`\`mermaid\nsequenceDiagram\nAlice->>Bob hi\n\`\`\``;
    expect(await repairMermaidResponse(text)).toBe(text.replace(`\n${bad}\n${good}`, `\n${good}\n${good}`).replace("Alice->>Bob hi", "Alice->>Bob: hi"));
    const ambiguous = "```mermaid\nflowchart TD\nA -- > B\nC -- > D\n```";
    expect(await repairMermaidResponse(ambiguous)).toBe(ambiguous);
    expect(await repairMermaidResponse("```mermaid\nflowchart TD\nA -- > B")).toBe("```mermaid\nflowchart TD\nA -- > B");
    expect(await repairMermaidResponse(bad, async () => { throw Error("validator unavailable"); })).toBe(bad);
  });
  it("repairs independent sequence and flowchart diagrams in one response", async () => {
    const sequence = "~~~mermaid\nsequenceDiagram\nAlice->>Bob hi\n~~~";
    const fixed = "~~~mermaid\nsequenceDiagram\nAlice->>Bob: hi\n~~~";
    const text = `first\n${bad}\nsecond\n${sequence}\nthird\n${good}`;
    expect(await repairMermaidResponse(text)).toBe(`first\n${good}\nsecond\n${fixed}\nthird\n${good}`);
    expect(await repairMermaidResponse(await repairMermaidResponse(text))).toBe(`first\n${good}\nsecond\n${fixed}\nthird\n${good}`);
    const many = Array.from({ length: 17 }, () => bad).join("\n");
    const result = await repairMermaidResponse(many);
    expect(result.split(good).length - 1).toBe(16);
    expect(result.endsWith(bad)).toBe(true);
  });
  it("replaces only successful final assistant text via the message_end event contract", async () => {
    const handlers = new Map<string, Function[]>();
    register({ on(name: string, handler: Function) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); } });
    expect([...handlers.keys()]).toEqual(["input", "session_start", "session_switch", "message_end", "turn_end"]);
    const handler = handlers.get("message_end")![0];
    const original = { role: "assistant", stopReason: "stop", content: [{ type: "thinking", thinking: "keep" }, { type: "text", text: bad }] };
    const changed = await handler({ message: original });
    expect(changed.message.content).toEqual([{ type: "thinking", thinking: "keep" }, { type: "text", text: good }]);
    expect(original.content[1].text).toBe(bad);
    for (const message of [
      { ...original, stopReason: "aborted" }, { ...original, stopReason: "error" },
      { ...original, content: [...original.content, { type: "toolCall", name: "Bash" }] },
      { role: "toolResult", content: [{ type: "text", text: bad }] },
      { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "" }] },
    ]) expect(await handler({ message })).toBeUndefined();
  });
});
