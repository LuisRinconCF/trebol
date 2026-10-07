// Intentionally invokes the implementation for isolated retrieval experiments; production index/toggle loading is covered by tools/install/check-load.mjs.
#!/usr/bin/env node
/** Real registered memory_history -> real isolated Pi child, five synthetic cases per strategy.
 * Run: ./node_modules/.bin/vite-node tools/experiments/memory-retrieval/live-five.mjs
 * Output: artifacts/memory-retrieval/live-five-<timestamp>/results.jsonl (raw call/receipt metadata).
 * Set MEMORY_BENCH_METHODS=control,all,edit to run a subset; default runs all nine.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const output = resolve(repo, 'artifacts/memory-retrieval', `live-five-${Date.now()}`);
const sandbox = mkdtempSync(join(tmpdir(), 'memory-live-five-'));
mkdirSync(output, { recursive: true });
const previous = process.env.PI_SWARM_MEMORY_DIR;
process.env.PI_SWARM_MEMORY_DIR = join(sandbox, 'memory');
const source = readFileSync(join(repo,'.pi/lib/context/knowledge-pageindex.ts'),'utf8');
const start = source.indexOf('function rankedSections('), end = source.indexOf('\n/** Render task Q&A',start);
if (start < 0 || end < 0) throw Error('Candidate implementation boundary changed');
const terms = `const terms = [...new Set((query.toLocaleLowerCase().match(/[\\p{L}\\p{N}_.-]+/gu)??[]).filter(w=>w.length>=3&&!new Set(['where','what','does','the','for','with','from','that','this','about','today','unknown','question','memory']).has(w)))];`;
const matcher = {
  phrase: `return hay.includes(query.toLocaleLowerCase())?terms.length:0;`,
  any: `return terms.filter(w=>hay.includes(w)).length;`,
  all: `return terms.length&&terms.every(w=>hay.includes(w))?terms.length:0;`,
  stem: `const normalize=w=>w.replace(/(?:ing|ers|ies|es|s)$/,'');const ws=(hay.match(/[\\p{L}\\p{N}_.-]+/gu)??[]).map(normalize);return terms.filter(w=>ws.includes(normalize(w))).length;`,
  prefix: `const ws=hay.match(/[\\p{L}\\p{N}_.-]+/gu)??[];return terms.filter(w=>ws.some(x=>x.startsWith(w)||w.startsWith(x))).length;`,
  edit: `const ws=hay.match(/[\\p{L}\\p{N}_.-]+/gu)??[];const dist=(a,b)=>{let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[b.length]};return terms.filter(w=>ws.some(x=>Math.abs(x.length-w.length)<=2&&dist(w,x)<=2)).length;`,
  trigram: `const grams=s=>{const out=new Set();for(let i=0;i<s.length-2;i++)out.add(s.slice(i,i+3));return out};const q=grams(terms.join(' ')),d=grams(hay);return q.size?[...q].filter(x=>d.has(x)).length/q.size:0;`,
  expanded: `const map={reverse:['rollback'],release:['deployment'],live:['habitat'],otters:['otter']};return terms.filter(w=>[w,...(map[w]??[])].some(x=>hay.includes(x))).length;`,
};
const strategies = ['control',...Object.keys(matcher)];
const wanted = (process.env.MEMORY_BENCH_METHODS?.split(',') ?? strategies).filter(s=>strategies.includes(s));
if (!wanted.length) throw Error('No valid methods selected');
const cases = [
  {name:'exact',query:'amber otter habitat',expect:'otter'},
  {name:'reordered',query:'habitat for amber otter',expect:'otter'},
  {name:'verbose',query:'where does the amber otter inhabit the quiet marsh today',expect:'otter'},
  {name:'typo',query:'ambr ottr habtat',expect:'otter'},
  {name:'synonym',query:'reverse a release',expect:'deploy'},
];
const fixture = [
  ['otter','Amber otter habitat is the quiet marsh.','repository'],
  ['fox','Amber fox habitat is the open field.','repository'],
  ['heron','Cobalt heron nests beside the quiet marsh.','repository'],
  ['deploy','Rollback deployment uses a blue-green switch.','repository'],
  ['billing','Invoices are kept in PostgreSQL for seven years.','repository'],
  ['other-scope','Amber otter habitat is the quiet marsh.','worktree'],
];
const {openKnowledgeStore} = await import(pathToFileURL(join(repo,'.pi/lib/state/knowledge-store.ts')));
const results = join(output,'results.jsonl');
function candidateCode(method) {
  return `function rankedSections(index: ContextIndex, scope: { namespace:string;workspace:string;session:string }, query:string, limit:number) {
 ${terms}
 if(!terms.length)return [];
 const rows: Array<{sourceId:string;nodeId:string;score:number;hits:number}> = [];
 for(const src of index.inspect(scope)) { const walk=(nodes:typeof src.tree)=>{for(const n of nodes){if(!n.children.length&&!/\\bAnswer: unanswered\\b/i.test(n.text)){
 const hay=(n.title+'\\n'+n.text).toLocaleLowerCase(); const hits=terms.filter(w=>hay.includes(w)).length;
 const score=(()=>{${matcher[method]}})();
 if(score>0 && ( ${method==='all'||method==='phrase'?'true':'score >= (terms.length===1?1:2)' }))rows.push({sourceId:src.id,nodeId:n.nodeId,score,hits});
 }walk(n.children)}};walk(src.tree) }
 return rows.sort((a,b)=>b.score-a.score||b.hits-a.hits).slice(0,limit);
}\n`;
}
async function runChild(command,args,opts,trace) {
  if(command!=='env'||args[4]!=='pi'||!args.includes('memory_browse,memory_read,memory_select'))throw Error('Unexpected child invocation');
  const variables=args.slice(0,4),snapshot=variables.find(x=>x.startsWith('PI_SWARM_MEMORY_RETRIEVAL_SNAPSHOT='))?.split('=').slice(1).join('=');
  const receipt=variables.find(x=>x.startsWith('PI_SWARM_MEMORY_RETRIEVAL_RECEIPT='))?.split('=').slice(1).join('=');
  trace.child={executable:'pi',argv:args.slice(4).map(x=>x.length>600?'[prompt omitted]':x),snapshotCards:JSON.parse(readFileSync(snapshot,'utf8')).cards.map(c=>({key:c.key,id:c.id,scope:c.scope,status:c.status,excerpt:c.excerpt})),timeoutMs:opts.timeout};
  const child=spawn(command,args,{cwd:opts.cwd,env:process.env,stdio:['ignore','pipe','pipe'],detached:true});
  let stdout='',stderr='',killed=false;const cap=65536;
  for(const [stream,save] of [[child.stdout,x=>stdout=(stdout+x).slice(0,cap)],[child.stderr,x=>stderr=(stderr+x).slice(0,cap)]])stream.on('data',save);
  const timer=setTimeout(()=>{killed=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},Math.min(opts.timeout??45000,45000));
  const code=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',done)}).finally(()=>clearTimeout(timer));
  trace.child.exit=code;trace.child.killed=killed;trace.child.stdout=stdout.slice(0,1200);trace.child.stderr=stderr.slice(0,1200);
  trace.child.receipt=existsSync(receipt)?JSON.parse(readFileSync(receipt,'utf8')):null;
  return {code,killed,stdout,stderr};
}
try {
  for (const method of wanted) {
    const root=join(sandbox,method);
    mkdirSync(join(root,'extensions/memory-history'),{recursive:true});
    mkdirSync(join(root,'packages/runtime/core/src'),{recursive:true});
    cpSync(join(repo,'.pi/lib'),join(root,'.pi/lib'),{recursive:true});
    cpSync(join(repo,'extensions/memory-history/extension.ts'),join(root,'extensions/memory-history/extension.ts'));
    cpSync(join(repo,'packages/runtime/core/src/tool-renderer.ts'),join(root,'packages/runtime/core/src/tool-renderer.ts'));
    const target=join(root,'.pi/lib/context/knowledge-pageindex.ts');
    if(method!=='control')writeFileSync(target,source.slice(0,start)+candidateCode(method)+source.slice(end));
    const {default:extension}=await import(pathToFileURL(join(root,'extensions/memory-history/extension.ts')));
    const hooks=new Map(),tools=new Map(),trace={};
    extension({on:(name,fn)=>hooks.set(name,fn),registerTool:t=>tools.set(t.name,t),exec:(cmd,args,opts)=>runChild(cmd,args,opts,trace)});
    hooks.get('session_start')?.({}, {cwd:root,model:{provider:'clover-plexus',id:'luna'},sessionManager:{getEntries:()=>[],getSessionFile:()=>join(root,'session.jsonl')}});
    // Copy fixture into this variant's repository identity, not into real user memory.
    for(const [name,text,scope] of fixture) openKnowledgeStore({cwd:root,scope}).put({id:name.replace(/-/g,'_'),text,status:'verified',kind:'fact',source:'synthetic-benchmark',evidence:[{ref:'synthetic:fixture'}]});
    for(const example of cases){
      const row={method,example:example.name,query:example.query,expected:example.expect,trace:{}};
      try{const begin=Date.now();const response=await tools.get('memory_history').execute('benchmark',{operation:'recall',scope:'repository',status:'verified',mode:'topical',query:example.query,limit:3});row.elapsedMs=Date.now()-begin;row.result=response.isError?{error:response.content?.[0]?.text}:response.details;row.modelText=response.content?.[0]?.text;row.trace=trace.child??null;}
      catch(error){row.result={error:String(error)};row.trace=trace.child??null;}
      writeFileSync(results,JSON.stringify(row)+'\n',{flag:'a'});
      console.log(`${method}/${example.name}: ${row.result.status??row.result.error} ${row.result.knowledge?.map(x=>x.id).join(',')??''}`);
      delete trace.child;
    }
  }
} finally { if(previous===undefined)delete process.env.PI_SWARM_MEMORY_DIR;else process.env.PI_SWARM_MEMORY_DIR=previous;rmSync(sandbox,{recursive:true,force:true}); }
console.log(`Raw results: ${results}`);
