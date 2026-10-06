#!/usr/bin/env node
// Read-only real-project diagnosis. Emits bounded metadata, never record bodies or raw child output.
// Run: ./node_modules/.bin/vite-node tools/experiments/memory-retrieval/real-ask-diagnostic.mjs
import {existsSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import memoryHistoryExtension from '../../../.pi/extensions/40-state/memory-history.ts';

const cwd=process.cwd(),hooks=new Map(),tools=new Map(),traces=[];
const pi={on:(name,handler)=>hooks.set(name,handler),registerTool:tool=>tools.set(tool.name,tool),exec:(command,args,opts)=>new Promise((resolve,reject)=>{
 if(command!=='env'||!args.includes('memory_browse,memory_read,memory_select'))return reject(Error('unexpected child invocation'));
 const variable=name=>args.find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
 const snapshot=variable('PI_SWARM_MEMORY_RETRIEVAL_SNAPSHOT'),receipt=variable('PI_SWARM_MEMORY_RETRIEVAL_RECEIPT');
 if(!snapshot||!receipt)return reject(Error('missing snapshot or receipt'));
 const input=JSON.parse(readFileSync(snapshot,'utf8'));
 const trace={offered:input.cards.map(card=>({key:card.key,scope:card.scope,status:card.status})),events:[],receipt:null,exit:null};
 traces.push(trace);
 const child=spawn(command,args,{cwd:opts.cwd,env:{...process.env,PI_SWARM_MEMORY_RETRIEVAL_TRACE:'1'},stdio:['ignore','pipe','pipe'],detached:true});
 let stdout='',stderr='',stdoutBytes=0,stderrBytes=0,killed=false;
 child.stdout.on('data',buffer=>{stdoutBytes+=buffer.length;stdout=(stdout+buffer).slice(0,65536)});
 child.stderr.on('data',buffer=>{stderrBytes+=buffer.length;stderr=(stderr+buffer).slice(0,65536)});
 const timer=setTimeout(()=>{killed=true;try{process.kill(-child.pid,'SIGKILL')}catch{}},Math.min(opts.timeout??45000,45000));
 child.once('error',error=>{clearTimeout(timer);trace.exit={kind:'spawn-error',code:error.code??'unknown'};reject(error)});
 child.once('exit',code=>{clearTimeout(timer);
  const traceFile=receipt+'.trace.jsonl';
  if(existsSync(traceFile))trace.events=readFileSync(traceFile,'utf8').trim().split('\n').slice(0,8).map(JSON.parse);
  if(existsSync(receipt)){const value=JSON.parse(readFileSync(receipt,'utf8'));trace.receipt={supported:value.supported,selected:value.selected?.map(item=>item.key),answerPresent:Boolean(value.answer?.trim())};}
  trace.exit={code,killed,stdoutBytes,stderrBytes,stderrKind:/upstream error/i.test(stderr)?'upstream-error':/rate.limit|429/i.test(stderr)?'rate-limit':/timeout/i.test(stderr)?'timeout':stderrBytes?'other-stderr':'none'};
  // Exercise the exact post-receipt timeout branch without relying on a slow provider.
  const simulate=process.env.MEMORY_DIAG_POST_RECEIPT_TIMEOUT==='1' && existsSync(receipt);
  if(simulate)trace.exit.simulatedPostReceiptTimeout=true;
  resolve({code:simulate?null:code,killed:killed||simulate,stdout,stderr});
 });
})};
memoryHistoryExtension(pi);
hooks.get('session_start')({}, {cwd,model:{provider:'clover-plexus',id:'luna'},sessionManager:{getEntries:()=>[],getSessionFile:()=>join(cwd,'session.jsonl')}});
const queries=process.env.MEMORY_DIAG_POST_RECEIPT_TIMEOUT==='1'
 ? ['In what year did Pi-Swarm bootstrap first run on Europa\'s oceans?']
 : process.env.MEMORY_DIAG_REPEAT_MISS==='1'
 ? Array(4).fill('In what year did Pi-Swarm bootstrap first run on Europa\'s oceans?')
 : ['In what year did Pi-Swarm bootstrap first run on Europa\'s oceans?','What does Pi-Swarm bootstrap durable recall include?'];
for(const query of queries){
 const before=traces.length;
 const response=await tools.get('memory_history').execute('real-ask-diagnostic',{operation:'ask',query,scope:'repository',status:'verified',mode:'topical',limit:3});
 const value=response.details;
 console.log(JSON.stringify({query,status:value?.status??'tool-error',reason:value?.reason,answer:value?.answer,referenceKeys:value?.references?.map(item=>item.key),knowledgeIds:value?.knowledge?.map(item=>item.id),trace:traces.slice(before)}));
}
