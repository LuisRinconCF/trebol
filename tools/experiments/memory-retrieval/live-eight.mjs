#!/usr/bin/env node
// Live benchmark entry point. Pi's ExtensionAPI (including pi.exec) exists
// only inside a running extension session; standalone node cannot supply it.
// Keep this guard explicit rather than pretending offline ranking is live.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, '.pi/lib/context/memory-agent.ts');
const child = join(root, '.pi/lib/state/memory-retrieval-worker.ts');
const pi = process.env.PI_SWARM_LIVE_BENCH_PI;
if (!existsSync(source) || !existsSync(child)) throw new Error('Run from the Pi-Swarm repository root');
const contract = readFileSync(source, 'utf8');
const worker = readFileSync(child, 'utf8');
const supported = Boolean(pi && contract.includes('pi.exec("env", args') && worker.includes('memory_select'));
console.log(JSON.stringify({
  status: supported ? 'pi-session-required' : 'blocked',
  reason: 'This harness must be invoked from an active Pi extension with its real ExtensionAPI pi.exec; standalone Node has no registered memory_history tool or child-exec adapter.',
  repo: root,
  productionContracts: {
    liveExec: contract.includes('pi.exec("env", args'),
    selectionReceipt: worker.includes('writeFileSync(receipt'),
    selectionTool: worker.includes('name: "memory_select"'),
  },
  bounds: { configurations: 9, childTimeoutMs: 45_000, maximumChildCalls: 9 },
  partial: true,
  note: 'No private data read; no child launched. Implementing an active-session runner requires a Pi extension tool/command callback and still needs end-to-end output capture before claiming benchmark results.'
}, null, 2));
process.exitCode = 2;
