/** Prose-only projection. Native decoding validates payloads; unused branches are not retained. */
type ObjectValue = Record<string, any>;
const envelope = new Set(["type", "id", "parentId", "timestamp", "cwd", "version", "name"]);

/** Native path for small/noncanonical records; preserves last duplicate key semantics. */
export function projectProseRecord(value: unknown): ObjectValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input = value as ObjectValue, result: ObjectValue = {};
  for (const key of envelope) if (Object.hasOwn(input, key)) result[key] = input[key];
  const message = input.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    result.message = { role: message.role };
    if (typeof message.content === "string") result.message.content = message.content;
    else if (Array.isArray(message.content)) result.message.content = message.content.map(block =>
      block && typeof block === "object" && !Array.isArray(block) ? { type: block.type, text: block.text } : null);
  }
  return result;
}

/** Native decoding won measured CPU benchmarks against the selective scanner.
 * Keep the projection seam so a faster proven decoder can replace it later.
 */
export function parseProseRecord(text: string): ObjectValue | undefined {
  return projectProseRecord(JSON.parse(text));
}
