#!/usr/bin/env node
// Synthetic, isolated evaluation. Candidate strategies run over records read via
// the registered memory_history tool; no strategy is claimed to be live recall.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'pi-swarm-memory-eight-'));
process.env.PI_SWARM_MEMORY_DIR = join(root, 'store');
const { default: extension } = await import(pathToFileURL(join(process.cwd(), 'extensions/memory-history/extension.ts')));
const registered = new Map(), hooks = new Map();
extension({ registerTool: t => registered.set(t.name, t), on: (name, fn) => hooks.set(name, fn), getActiveTools: () => ['memory_history'] });
const tool = registered.get('memory_history');
if (!tool) throw Error('memory_history did not register');
hooks.get('session_start')?.({}, { cwd: root, sessionManager: { getEntries: () => [], getSessionFile: () => join(root, 'session.jsonl') } });
async function call(input) {
  const raw = await tool.execute('experiment', input);
  if (raw.isError) throw Error(raw.content[0]?.text);
  return JSON.parse(raw.content[0].text);
}
const fixture = [
  ['otter', 'Amber otter habitat is the quiet marsh.', 'repository', 'verified'],
  ['fox', 'Amber fox habitat is the open field.', 'repository', 'verified'],
  ['heron', 'Cobalt heron nests beside the quiet marsh.', 'repository', 'verified'],
  ['deploy', 'Rollback deployment uses a blue-green switch.', 'repository', 'verified'],
  ['billing', 'Invoices are kept in PostgreSQL for seven years.', 'repository', 'verified'],
  ['worktree', 'Amber otter habitat is the quiet marsh.', 'worktree', 'verified'],
  ['candidate', 'Amber otter habitat is the quiet marsh.', 'repository', 'candidate'],
];
const queries = [
  ['exact', 'amber otter habitat', 'otter'],
  ['word-order', 'habitat for amber otter', 'otter'],
  ['typo', 'ambr ottr habtat', 'otter'],
  ['broad', 'where do amber otters live', 'otter'],
  ['distractor', 'amber fox habitat', 'fox'],
  ['synonym', 'reverse a release', 'deploy'],
  ['miss', 'quasar zeppelin taxonomy', null],
];
const stop = new Set(['a','an','the','do','does','for','of','is','in','where','what','how','to','are']);
const tokens = s => [...new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2 && !stop.has(w)))];
const stem = w => w.replace(/(?:ing|ers|ies|es|s)$/,'');
const grams = s => { const a = new Set(); for (let i=0;i<s.length-2;i++) a.add(s.slice(i,i+3)); return a; };
const distance = (a,b) => { let p=[...Array(b.length+1).keys()]; for(let i=1;i<=a.length;i++){let c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[b.length]; };
const synonyms = { reverse:['rollback'], release:['deployment'], live:['habitat'], otters:['otter'] };
const score = {
  phrase: (q,d) => d.toLowerCase().includes(q.toLowerCase()) ? 1 : 0,
  any: (q,d) => tokens(q).filter(w=>tokens(d).includes(w)).length,
  all: (q,d) => { const t=tokens(q); return t.length && t.every(w=>tokens(d).includes(w)) ? t.length : 0; },
  stem: (q,d) => tokens(q).filter(w=>tokens(d).map(stem).includes(stem(w))).length,
  prefix: (q,d) => tokens(q).filter(w=>tokens(d).some(x=>x.startsWith(w)||w.startsWith(x))).length,
  edit: (q,d) => tokens(q).reduce((n,w)=>n+(tokens(d).some(x=>Math.abs(x.length-w.length)<=2&&distance(x,w)<=2)?1:0),0),
  trigram: (q,d) => { const qg=grams(tokens(q).join(' ')),dg=grams(tokens(d).join(' ')); return qg.size ? [...qg].filter(x=>dg.has(x)).length/qg.size : 0; },
  expanded: (q,d) => tokens(q).filter(w=>[w,...(synonyms[w]??[])].some(x=>tokens(d).includes(x))).length,
};
try {
  const ids = new Map();
  for (const [name,text,scope,status] of fixture) {
    const result = await call({operation:'remember',scope,text});
    const record = result.knowledge[0];
    ids.set(name,record.id);
    if(status==='verified') await call({operation:'correct',scope,id:record.id,expectedRevision:record.revision,text,status:'verified',evidence:[{ref:'synthetic:fixture'}]});
  }
  const baseline = await Promise.all(queries.map(async ([name,query]) => ({name,query,ids:(await call({operation:'search',scope:'repository',status:'verified',query})).knowledge.map(r=>[...ids].find(([,id])=>id===r.id)?.[0])})));
  // Replay/get are real registered-tool reads. Strategies below are offline
  // candidate ranking over exactly the visible, scoped/status-filtered corpus.
  const visible = (await call({operation:'replay',scope:'repository',status:'verified',limit:100})).knowledge;
  const methods = Object.entries(score).map(([method,rank]) => ({method,calls:[{operation:'replay',scope:'repository',status:'verified',limit:100}],results:queries.map(([name,query,expected]) => ({name,query,expected,ranked:visible.map((r,i)=>({id:r.id,name:[...ids].find(([,id])=>id===r.id)?.[0],score:rank(query,r.text),i})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,5).map(({name,score})=>({name,score}))}))}));
  for (const method of methods) for(const row of method.results) for(const found of row.ranked) {
    const r=await call({operation:'get',scope:'repository',id:ids.get(found.name)});
    if(r.knowledge[0]?.status!=='verified') throw Error(`Incorrect visibility: ${found.name}`);
  }
  console.log(JSON.stringify({fixture:fixture.map(([name,text,scope,status])=>({name,text,scope,status})),baseline,methods,warning:'Strategies operate on registered-tool replay output and validate selected IDs with get; only baseline invokes live search, not eight live recall algorithms.'},null,2));
} finally { rmSync(root,{recursive:true,force:true}); }
