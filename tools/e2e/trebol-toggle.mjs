import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = resolve(new URL('../..', import.meta.url).pathname);
const piRoot = '/usr/lib/node_modules/@earendil-works/pi-coding-agent';
const { discoverAndLoadExtensions } = await import(pathToFileURL(join(piRoot, 'dist/core/extensions/loader.js')));
const temp = mkdtempSync(join(tmpdir(), 'trebol-toggle-e2e-'));
try {
  const local = join(temp, '.pi', 'extensions');
  mkdirSync(local, { recursive: true });
  const layers = ['00-runtime','10-context','20-policy','30-tools','40-state','50-ui'].map((name)=>join(repo,'.pi/extensions',name));
  const manifestDirs = [join(repo, '.pi/extensions/trebol-loader.ts'), ...layers];
  const cwd = temp;
  const agentDir = join(temp, 'agent');
  mkdirSync(join(agentDir, 'extensions'), { recursive: true });
  const globalDir = join(temp, 'global');
  mkdirSync(join(globalDir, 'extensions'), { recursive: true });
  writeFileSync(join(globalDir, 'extensions', 'sentinel.js'), `export default function(pi) { pi.registerCommand('sentinel', {handler:async()=>{}}); }`);
  const { extensions, errors } = await discoverAndLoadExtensions(manifestDirs, cwd, globalDir);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(extensions.length > 0, 'ON reload registers project factories');
  // Verify resident wrapper mode gate using registered factory wrappers and actual Pi loader inventories.
  const offEnv = globalThis;
  offEnv[Symbol.for('pi-swarm-trebol-mode')] = 'off';
  assert.equal(offEnv[Symbol.for('pi-swarm-trebol-mode')], 'off');
  const { extensions: offExtensions, errors: offErrors } = await discoverAndLoadExtensions(manifestDirs, cwd, globalDir);
  assert.equal(offErrors.length, 0, JSON.stringify(offErrors));
  const visible = (items) => items.filter((ext) => !ext.path.endsWith('/trebol-loader.ts') && ([...ext.tools.keys()].length || [...ext.commands.keys()].length || [...ext.handlers.keys()].length || [...ext.shortcuts.keys()].length));
  const offVisible = visible(offExtensions).filter((ext) => /\/.pi\/extensions\/(00-runtime|10-context|20-policy|30-tools|40-state|50-ui)\//.test(ext.path));
  assert.equal(offVisible.length, 0, 'OFF must omit project registrations');
  assert.ok(offExtensions.some((ext) => ext.path.endsWith('/trebol-loader.ts')), 'resident local-discovered controller remains');
  offEnv[Symbol.for('pi-swarm-trebol-mode')] = 'on';
  const { extensions: onExtensions, errors: onErrors } = await discoverAndLoadExtensions(manifestDirs, cwd, globalDir);
  assert.equal(onErrors.length, 0, JSON.stringify(onErrors));
  const onVisible = visible(onExtensions).filter((ext) => /\/.pi\/extensions\/(00-runtime|10-context|20-policy|30-tools|40-state|50-ui)\//.test(ext.path));
  assert.ok(onVisible.length > 0, 'ON reload restores Trebol registrations');
  assert.ok(onVisible.some((ext) => ext.tools.size > 0), 'ON inventory includes tools');
  assert.ok(onVisible.some((ext) => ext.handlers.size > 0), 'ON inventory includes hooks');
  assert.ok(offExtensions.some(e => e.commands.has('sentinel')), 'unrelated extension retained');
  console.log(JSON.stringify({ on: onVisible.length, off: offVisible.length, restored: onVisible.length, tools: onVisible.reduce((n,e)=>n+e.tools.size,0), hooks: onVisible.reduce((n,e)=>n+e.handlers.size,0), note: 'SDK loader inventory verified; interactive Ctrl+N/editor preservation not exercised' }));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
