#!/usr/bin/env bash
set -euo pipefail
clear
printf '\033[1;36mBOOTSTRAP TUI · COLLAPSED\033[0m\n\n'
printf '✓ bootstrap [████████] complete\n'
printf '  mode=parallel · model=provider/model · 1234ms\n'
printf '  ▸ scope  /workspace/project\n'
printf '  ▸ memory 3/?   selectors 2/2   skills 1/1   tasks 2/2\n'
printf '\n  ↳ handoff ready (ctrl+o to expand)\n'
printf '  A detailed handoff with task evidence and implementation guidance.\n'
sleep 2
clear
printf '\033[1;35mBOOTSTRAP TUI · FULL\033[0m\n\n'
printf '✓ bootstrap [████████] complete\n'
printf '  mode=parallel · model=provider/model · 1234ms\n'
printf '  ▸ scope  /workspace/project\n'
printf '  ▸ memory 3/?   selectors 2/2   skills 1/1   tasks 2/2\n'
printf '\n  ── evidence ──\n'
printf '  ↳ renderer contract: docs/design.md\n'
printf '\n  ── handoff ──\n'
printf '  A detailed handoff with task evidence and implementation guidance.\n'
printf '  Existing tasks were updated and missing tasks created as proposed.\n'
sleep 2
clear
printf '\033[1;31mBOOTSTRAP TUI · FAILURE\033[0m\n\n'
printf '✗ bootstrap [████░░░░] memory/skill selection\n'
printf '  mode=combined · model=provider/model · 842ms\n'
printf '  ── failures ──\n'
printf '  ✗ selector: Bootstrap consultation timed out\n'
sleep 10
