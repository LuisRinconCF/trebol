# Trebol extension toggle: implementation plan

## Goal and acceptance

Ctrl+N toggles this project's extension factories OFF/ON while a minimal
controller remains resident. OFF omits those factories at runtime reconstruction;
it does not edit package manifests or persisted configuration. Footer status is
text only. The keybinding may override Pi's existing binding, as approved.

Acceptance: exercise OFF/ON with E2E against actual registered tool/command/hook
inventories; retain unrelated extensions and native tools; preserve unsaved
editor text; verify both project root package loading and Pi local discovery.
The E2E runner and evidence are recorded below after implementation.

## Runtime/API audit

Inspected installed Pi at `/home/swarm/.local/bin/pi`, which reports version
`0.87.1`; its package is
`/usr/lib/node_modules/@earendil-works/pi-coding-agent`.

- `dist/core/extensions/types.d.ts` defines `ExtensionCommandContext.reload()`
  as the command-side reload operation. The adjacent installed docs
  (`docs/extensions.md`, “Add it to Pi”) say it reloads extensions, skills,
  prompts, themes, and context files and replaces the extension runtime.
- The extension factory API in `dist/core/extensions/types.d.ts` registers
  lifecycle handlers, tools, commands, shortcuts, renderers, etc.; it exposes no
  sibling unload, remove-registration, or dynamic factory-selection operation.
- `examples/extensions/reload-runtime.ts` demonstrates invoking `ctx.reload()`
  only from a user command. Ctrl+N queues `/trebol-toggle` through
  `pi.sendUserMessage`; the command performs `ctx.reload()`.
- This repository's root `package.json` discovers six project extension layer
  directories. Each layer manifest lists its factories; Pi also supports user
  and explicit CLI extension discovery. No supported runtime API was found for
  filtering those factories while retaining a project controller.

## Implementation shape

Layer manifests now point to guarded factories under nested directories (not
autodiscovered by Pi). Each wrapper dynamically imports its distinct original
factory only when the shared process-local mode is ON. The root manifest also
loads the resident controller; Pi de-duplicates identical resolved paths when
project-local and package discovery both encounter it. Toggle transitions reject
non-idle runtime state and serialize reload, retaining prior mode if reload fails.
Ctrl+N enqueues `/trebol-toggle`; the editor remains the native input surface.

## Verification

- `pi --version` -> `0.87.1`.
- Read installed extension API declarations, extension documentation, reload
  example, and this repository's root/layer manifests.
- SDK E2E `node tools/e2e/trebol-toggle.mjs` passed: 47 project extensions with 55 tools and 165 handlers when ON, zero project registrations when OFF, and 47 restored on the next ON reload. The isolated SDK runner does not exercise a live TUI keypress or unsaved editor-buffer preservation.
- No unit tests were created. Vendor and installed runtime files were not edited.

## Required follow-up acceptance flow

Once runtime selection is supported, launch a temporary isolated Pi config with
project extensions enabled and no provider request. Capture the registered
extension inventory, edit but do not save a scratch buffer, press Ctrl+N and
assert only controller remains and scratch text is unchanged, press Ctrl+N
again and assert the original inventory and text are restored, then invoke
ordinary `/reload` and verify normal behavior. Repeat discovery inspection with
both project-root and user-local extensions enabled. This flow is not yet run.

## Independent review verification

Parent review corrected shortcut dispatch to pass `expandPromptTemplates: true`:
installed Pi otherwise sends the slash command to the model instead of executing it.
`node tools/e2e/trebol-toggle-session.mjs` passed with the real resident controller,
real AgentSession, real resource loader and one representative guarded extension:
shortcut handler OFF, command ON/OFF/ON, native read/bash/edit/write retained, zero
model messages. `node tools/e2e/trebol-toggle.mjs` passed the full-pack factory
inventory: 47 ON, zero OFF, 47 restored (55 tools, 165 handler groups), with an
unrelated sentinel command retained. `git diff --check` passed.

These checks do not establish physical terminal key dispatch, rendered footer,
draft preservation, full-pack session-start/shutdown side-effect cleanup, or
reload-failure recovery. Those acceptance obligations remain open. No unit tests
were added. The full inventory check sets mode directly; only the session check
exercises the actual toggle command and shortcut handler.

## Real terminal dogfood — direct shortcut (supersedes earlier dispatch)

Installed Pi is now 0.99.2. Ctrl+N no longer uses sendUserMessage at all.
`trebol-shortcut.ts` wraps the exported ExtensionRunner.getShortcuts method,
only adapting our symbol-marked Ctrl+N handler to a fresh command context.
That context provides the runtime's native reload action. The isolated adapter
checks host method shapes and does not edit installed Pi or other shortcuts.
This is a version-sensitive compatibility seam, not a new public Pi API.

Executed successfully:
- `python3 tools/e2e/trebol-toggle-tmux.py`: fresh isolated full-pack Pi terminal,
  actual tmux C-n events OFF/ON twice, both footer indicators, unchanged unsent
  draft, no `/trebol-toggle` text or shortcut errors in captured transcript.
- `node tools/e2e/trebol-toggle-session.mjs`: real runtime registrations disappear
  and return; native tools retained and no model messages added.
- Manual tmux session `trebol-toggle-dogfood`: draft `DRAFT-direct-reload-456`
  survived OFF then ON. Captures: `artifacts/trebol-toggle/off.txt` and `on.txt`.
  Session is left running for inspection with no credentials configured.

The initially observed command-injection report was not reproduced with the
previous corrected dispatch on this freshly installed Pi version, but that
message path has now been removed entirely. Existing running Pi sessions need
one `/reload` to pick up the change. Full-pack background cleanup, forced reload
failure recovery and compatibility with other Pi versions remain unverified.
