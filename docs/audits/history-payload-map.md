# History payload hierarchy and selective search

## Evidence scope

Source review, not private transcript sampling. Pi source under vendor is a read-only reference, not a runtime import or proof of the installed host version. Definitions: `vendor/pi-mono/packages/coding-agent/src/core/session-manager.ts:32-152`; message blocks: `vendor/pi-mono/packages/ai/src/types.ts:235-313`; coding-agent extensions: `vendor/pi-mono/packages/coding-agent/src/core/messages.ts:25-83`. Local metadata persistence: `.pi/extensions/40-state/swarm-conversation-metadata.ts:44-77`.

## Dispatch hierarchy

```text
JSONL record
├─ type=session → version, id, cwd, timestamp, parentSession
├─ type=session_info → name (latest wins; empty clears)
├─ type=message → id, parentId, timestamp → message.role
│  ├─ user → content:string OR content[]
│  │  ├─ type=text → text
│  │  └─ type=image → data, mimeType [skip image bytes]
│  ├─ assistant → content[]
│  │  ├─ type=text → text
│  │  ├─ type=thinking → thinking, thinkingSignature [not ordinary prose]
│  │  └─ type=toolCall → id, name, arguments [tool-call mode]
│  │  plus provider/model/api/usage/diagnostics [not ordinary prose]
│  ├─ toolResult → toolName, toolCallId, isError, content[].text
│  │  plus content[].data and details:any [skip for ordinary prose]
│  ├─ bashExecution → command, output, exitCode, cancelled, truncated
│  └─ custom → customType, content:string|blocks[], details:any
├─ type=custom_message → customType, content:string|blocks[], display, details
├─ type=compaction → summary, firstKeptEntryId, tokensBefore, details
├─ type=branch_summary → summary, fromId, details
├─ type=custom → customType, data:any [extension state, not chat]
└─ type=model_change|thinking_level_change|label → settings/bookmarks
```

## Query-specific extraction

| Mode | Required fields | Payloads that need no object allocation |
| --- | --- | --- |
| Workspace discovery | session.id/cwd/version | All message bodies after workspace mismatch |
| Metadata/recent listing | session fields, session_info.name, entry/message timestamps, message count, first substantive user text for derived title/preview | Remaining content, tool arguments/results, images, reasoning, extension state |
| Ordinary prose | entry IDs/times, message.role, string content or text blocks | Tool arguments/results, image data, thinking/signatures, usage/diagnostics/details |
| Tool calls | assistant.content[type=toolCall].name/id/arguments | Non-call blocks and provider metadata |
| Tool results | message.role/toolName/toolCallId/isError and text blocks | Images and opaque details unless explicitly supported |
| Get | envelope identity, selected message window and its requested content | Unselected message payload objects; still count records for current window semantics |
| Summary search (not implicitly ordinary prose) | compaction/branch_summary.summary | details, model configuration, extension state |

These are proposed extraction routes, not a claim that the current parser already performs selective decoding. Current reader still calls native JSON.parse on complete bounded records.

## Two different hierarchies

JSON nesting locates fields cheaply; `id`/`parentId` locates conversation branches. They are not interchangeable. Session persistence appends a tree, and active context walks leaf→root (`session-manager.ts:348-433`). A file-wide search can legitimately include sibling branches; active-branch-only retrieval would require an explicit contract and ancestry lookup. Do not accidentally drop sibling results while optimizing field extraction.

## Writer guarantees and exceptions

The normal writer serializes one JSON.stringify object followed by newline (`session-manager.ts:877,914,926,933`). appendMessage constructs type/id/parentId/timestamp/message in that order (`950-958`), useful as a fast-path hint only. Custom-message entry constructors use a different order (`1061-1077`). JSON property order is not a schema guarantee: imported/older files, reordered or escaped keys and extension payloads must not produce false negatives.

Version 1 lacks current IDs/parent links; v2→v3 renames hookMessage to custom (`226-290`). Unknown custom message types are allowed through declaration merging. The common envelope is stable; arbitrary branches are mostly arguments, details and custom data. Repeated nested keys such as type/text/name inside those branches must never be mistaken for envelope keys.

## Proposed low-level scanner

1. Compile the query into a field-selection mask: identity, metadata, prose, tool calls, tool results, summaries.
2. Scan structural bytes with depth and in-string/escape state. Classify only keys at the expected path. Skip irrelevant values without allocating objects; bytes still must be traversed unless indexed offsets exist.
3. Use writer-order fast dispatch for canonical records; structurally handle reordered fields or use a bounded native-parser fallback. Duplicate keys must preserve native last-value semantics or trigger fallback.
4. Decode selected strings only. Plain ASCII literals can have a direct byte-match fast path; escapes, Unicode/case-folding, redaction and regex require the appropriate decoded path. A raw-byte miss alone is not proof of semantic absence.
5. Keep bounded selected-field buffers and metadata, not entire record objects. This can eventually allow a huge image branch to be skipped while still finding small sibling text; the existing 1 MiB whole-record limit currently skips that entire record and reports partial coverage.
6. Feed the existing bounded ranking/stats pipeline. Preserve error/completeness accounting: skipping object allocation does not justify falsely labeling malformed JSON as a complete valid scan.

## Concrete issues exposed by this map

- Current title handling still reads header.name, but canonical names are session_info entries, including explicit clearing. Fix as part of projection integration.
- Bash execution uses message.command/output, not content; a generic content-only extractor misses it.
- Custom messages have two stored forms: message.role=custom and top-level custom_message. Neither is automatically human-authored prose.
- Large image/tool-details branches are the strongest motivation for selective decoding. Byte grep alone would search encoded image data, private reasoning and extension state that the public prose contract excludes.
- No measured speedup for the proposed selective scanner yet. Prior 2.28× result measured JSONL framing improvements only.
