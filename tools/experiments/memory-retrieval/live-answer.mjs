#!/usr/bin/env node
// Real registered tool -> real isolated Pi child. Synthetic temporary records only.
// Run: ./node_modules/.bin/vite-node tools/experiments/memory-retrieval/live-answer.mjs
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const cwd=process.cwd(),root=mkdtempSync(join(tmpdir(),'memory-answer-e2e-')),old=process.env.PI_SWARM_MEMORY_DIR;
const output=resolve(cwd,'artifacts/memory-retrieval',`live-answer-${Date.now()}`),rows=[];
mkdirSync(output,{recursive:true});
process.env.PI_SWARM_MEMORY_DIR=join(root,'store');
const dir=join(root,'workspace');
try {
 mkdirSync(join(dir,'.pi/extensions/40-state'),{recursive:true});mkdirSync(join(dir,'packages/runtime/core/src'),{recursive:true});
 cpSync(join(cwd,'.pi/lib'),join(dir,'.pi/lib'),{recursive:true});
 cpSync(join(cwd,'extensions/memory-history/extension.ts'),join(dir,'extensions/memory-history/extension.ts'));
 cpSync(join(cwd,'packages/runtime/core/src/tool-renderer.ts'),join(dir,'packages/runtime/core/src/tool-renderer.ts'));
 const {openKnowledgeStore}=await import(pathToFileURL(join(dir,'.pi/lib/state/knowledge-store.ts')));
 const save=(id,text,scope='repository',status='verified')=>openKnowledgeStore({cwd:dir,scope}).put({id,text,status,kind:'fact',source:'synthetic-e2e',evidence:status==='verified'?[{ref:'synthetic:fixture'}]:[]});
 save('orion','Orion stores invoices in PostgreSQL.');save('phoenix','Phoenix stores invoices in SQLite.');save('secret','Orion stores invoices in MongoDB.','worktree');save('draft','Orion stores invoices in MariaDB.','repository','candidate');
 const hooks=new Map(),tools=new Map();let childCalls=0,childTrace=null;
 const pi={on:(name,fn)=>hooks.set(name,fn),registerTool:t=>tools.set(t.name,t),exec:(command,args,opts)=>new Promise((resolve,reject)=>{
  if(command!=='env'||!args.includes('memory_browse,memory_read,memory_select'))return reject(Error('unexpected child'));
  const snapshot=args.find(x=>x.startsWith('PI_SWARM_MEMORY_RETRIEVAL_SNAPSHOT='))?.slice('PI_SWARM_MEMORY_RETRIEVAL_SNAPSHOT='.length);
  const receipt=args.find(x=>x.startsWith('PI_SWARM_MEMORY_RETRIEVAL_RECEIPT='))?.slice('PI_SWARM_MEMORY_RETRIEVAL_RECEIPT='.length);
  if(!snapshot||!receipt)return reject(Error('missing trace paths'));
  const cards=JSON.parse(readFileSync(snapshot,'utf8')).cards;
  childTrace={offered:cards.map(c=>({key:c.key,id:c.id,scope:c.scope,status:c.status,excerpt:c.excerpt})),events:[],receipt:null,exit:null,truncated:false};
  childCalls++;const child=spawn(command,args,{cwd:opts.cwd,env:{...process.env,PI_SWARM_MEMORY_RETRIEVAL_TRACE:'1'},stdio:['ignore','pipe','pipe'],detached:true});let stdout='',stderr='',killed=false;
  let stdoutBytes=0,stderrBytes=0;
  child.stdout.on('data',b=>{stdoutBytes+=b.length;stdout=(stdout+b).slice(0,65536)});child.stderr.on('data',b=>{stderrBytes+=b.length;stderr=(stderr+b).slice(0,65536)});
  const timer=setTimeout(()=>{killed=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},Math.min(opts.timeout,45000));
  child.once('error',e=>{clearTimeout(timer);childTrace.exit={error:e.name,killed};reject(e)});
  child.once('exit',code=>{clearTimeout(timer);
   const traceFile=`${receipt}.trace.jsonl`;
   if(existsSync(traceFile)) { const lines=readFileSync(traceFile,'utf8').trim().split('\n');childTrace.events=lines.slice(0,8).map(x=>JSON.parse(x));childTrace.truncated=lines.length>8; }
   if(existsSync(receipt))childTrace.receipt=JSON.parse(readFileSync(receipt,'utf8'));
   childTrace.exit={code,killed,stdoutBytes,stderrBytes};childTrace.truncated ||= stdoutBytes>65536||stderrBytes>65536;
   resolve({code,killed,stdout,stderr});
  });
 })};
 const {default:extension}=await import(pathToFileURL(join(dir,'extensions/memory-history/extension.ts')));
 extension(pi);hooks.get('session_start')({}, {cwd:dir,model:{provider:'clover-plexus',id:'luna'},sessionManager:{getEntries:()=>[],getSessionFile:()=>join(dir,'session.jsonl')}});
 const ask=async args=>{const before=childCalls;childTrace=null;const request={operation:'ask',scope:'repository',status:'verified',mode:'topical',limit:3,...args};const tool=tools.get('memory_history');const result=await tool.execute('live-answer',request);const row={request,result:result.isError?{error:result.content[0].text}:result.details,modelText:result.content[0].text,childCalls:childCalls-before,trace:childTrace,rendered:{call:tool.renderCall(request,{}).render(44),collapsed:tool.renderResult(result,{expanded:false},{}).render(44),expanded:tool.renderResult(result,{expanded:true},{}).render(44)}};rows.push(row);return row};
 const hit=await ask({query:'Where does Orion store invoices?'});
 const unsupported=await ask({query:'Which year did Orion store invoices?'});
 const miss=await ask({query:'Where does the nonexistent quasar keep spaceships?'});
 const invalid=await ask({query:''});
 const wrongScope=await ask({query:'Where does Orion store invoices?',scope:'global'});
 const wrongStatus=await ask({query:'Where does Orion store invoices?',status:'candidate'});
 const badLimit=await ask({query:'Where does Orion store invoices?',limit:13});
 const originalExec=pi.exec;pi.exec=async()=>{childTrace={offered:null,events:[],receipt:null,exit:{code:1,killed:false,synthetic:true},truncated:false};return {code:1,killed:false,stdout:'',stderr:'synthetic provider failure'}};
 const failedChild=await ask({query:'Where does Orion store invoices?'});pi.exec=originalExec;
 writeFileSync(join(output,'results.jsonl'),rows.map(row=>JSON.stringify(row)).join('\n')+'\n',{mode:0o600});
 const validTrace=row=>row.trace?.events?.[0]?.tool==='memory_browse'&&row.trace.events.some(e=>e.tool==='memory_read'&&e.key===row.trace.receipt?.selected?.[0]?.key&&e.accepted)&&row.trace.events.at(-1)?.tool==='memory_select'&&row.trace.events.at(-1)?.accepted&&row.trace.events.at(-1)?.keys?.join(',')===row.trace.receipt.selected.map(s=>s.key).join(',');
 if(hit.result.status!=='ok'||!hit.result.answer?.includes('PostgreSQL')||hit.result.answer?.includes('MongoDB')||hit.result.answer?.includes('MariaDB')||!hit.result.answer?.includes('[m0]')||!hit.modelText.includes('Answer: Orion stores invoices in PostgreSQL. [m0]')||!hit.modelText.includes('id=orion')||!hit.rendered.collapsed.join(' ').includes('PostgreSQL')||hit.rendered.collapsed.join(' ').includes('revision')||!hit.rendered.expanded.join(' ').includes('revision')||hit.rendered.expanded.some(line=>line.length>44)||hit.result.knowledge?.[0]?.id!=='orion'||hit.result.references?.[0]?.id!=='orion'||!hit.childCalls||!validTrace(hit)||hit.trace.truncated||hit.trace.offered.some(c=>c.id==='secret'||c.id==='draft')||unsupported.result.status!=='no-result'||unsupported.result.answer!==''||!unsupported.modelText.includes('Answer: none')||!unsupported.rendered.collapsed.join(' ').includes('No answer')||!unsupported.childCalls||unsupported.trace?.receipt?.supported!==false||unsupported.trace?.events?.at(-1)?.tool!=='memory_select'||unsupported.trace.truncated||miss.result.status!=='no-result'||miss.result.answer!==''||miss.childCalls||miss.trace||invalid.result.status!=='invalid-query'||wrongScope.result.status!=='not-indexed'||wrongStatus.result.status!=='ok'||wrongStatus.result.references?.[0]?.status!=='candidate'||!validTrace(wrongStatus)||badLimit.result.error!=='recall limit must be 1–12'||!badLimit.rendered.collapsed.join(' ').includes('Error')||failedChild.result.status!=='unavailable'||!failedChild.modelText.includes('Memory ask: unavailable')||!failedChild.trace?.exit?.synthetic||failedChild.trace.receipt)process.exitCode=1;
 console.log(`trace=${join(output,'results.jsonl')} cases=${rows.length} status=${process.exitCode?'failed':'passed'}`);
}finally{if(old===undefined)delete process.env.PI_SWARM_MEMORY_DIR;else process.env.PI_SWARM_MEMORY_DIR=old;rmSync(root,{recursive:true,force:true});}
