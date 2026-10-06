#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {appendFileSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const modes=process.argv.slice(2);
if(!modes.length||modes.some(m=>!['denied','allowed','interleaved','ambiguous','timeout'].includes(m)))throw Error('Modes: denied allowed interleaved ambiguous timeout');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const mode of modes){
 const temp=await mkdtemp(join(tmpdir(),'early-stream-'));
 const out=join(repo,'artifacts/early-stream-correction',`${Date.now()}-${mode}`);
 await mkdir(out,{recursive:true});await mkdir(join(temp,'cwd'));await mkdir(join(temp,'agent'));
 const trace=join(out,'trace.jsonl'),state=join(temp,'state.json'),effect=join(temp,'effect.json');
 const record=row=>appendFileSync(trace,JSON.stringify({at:Date.now(),phase:'driver',...row})+'\n');
 const rows=async()=> (await readFile(trace,'utf8')).split('\n').filter(Boolean).map(JSON.parse);
 await writeFile(trace,'');await writeFile(state,JSON.stringify({Bash:0,Skill:0,Inspect:0}));
 let server;const timers=new Set();let closed=false,tailSent=false;
 const denied=['denied','interleaved'].includes(mode);
 try{
  let request=0;
  server=createServer(async(req,res)=>{
   let raw='';for await(const b of req){raw+=b;if(raw.length>1024*1024){res.destroy();return;}}
   const body=JSON.parse(raw);const n=request++;record({type:'local_request',request:n});
   res.on('close',()=>{closed=true;record({type:'connection_closed',request:n});});
   if(mode==='timeout')return;
   res.writeHead(200,{'content-type':'text/event-stream'});
   const chunk=(delta,finish_reason=null)=>res.write(`data: ${JSON.stringify({id:`initial-${n}`,object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason}]})}\n\n`);
   const end=()=>{chunk({},'tool_calls');res.end('data: [DONE]\n\n');};
   if(n>0){chunk({role:'assistant',content:'Allowed step finished.'});chunk({},'stop');res.end('data: [DONE]\n\n');return;}
   const tool=(index,id,name,args)=>chunk({tool_calls:[{index,...(id?{id,type:'function'}:{}),function:{...(name?{name}:{}),arguments:args}}]});
   if(mode==='interleaved')tool(0,'inspect-1','Inspect','{"step_id":"step-');
   const i=mode==='interleaved'?1:0;
   tool(i,'bash-1','Bash',mode==='ambiguous'?'{"step_id":"step-7","command":"echo Skill':'{"step_id":"step-7","command":"echo');
   if(mode==='interleaved')tool(0,null,null,'7"}');
   record({type:'prefix_sent',tailSent:false});
   const timer=setTimeout(()=>{
    timers.delete(timer);record({type:'tail_release_attempt',connectionClosed:closed});
    if(res.destroyed||res.writableEnded){record({type:'late_tail_discarded'});return;}
    tailSent=true;tool(i,null,null,mode==='ambiguous'?' is just text"}':' accepted"}');record({type:'tail_sent'});end();
   },1000);timers.add(timer);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const scripted={providers:{probe:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:'openai-completions',apiKey:'dummy',models:[{id:'slow',contextWindow:16000,maxTokens:512,reasoning:false}]}}};
  await writeFile(join(temp,'agent/models.json'),JSON.stringify(scripted));
  await writeFile(join(temp,'agent/settings.json'),JSON.stringify({quietStartup:true,retry:{enabled:false}}));
  async function launch(phase,prompt,model,limit){
   const args=['--model',model,'--no-session','--no-extensions','--extension',join(repo,'tools/experiments/early-stream-correction/fixture.mjs'),'--no-builtin-tools','--tools','Bash,Skill,Inspect','--no-mcp','--no-skills','--no-context-files','--no-prompt-templates','--mode','json','--thinking','off','--print','--',prompt];
   record({type:'launch',targetPhase:phase,model,prompt});
   const child=spawn(process.env.PI_BIN||'pi',args,{cwd:join(temp,'cwd'),detached:true,env:{...process.env,HOME:temp,PI_CODING_AGENT_DIR:join(temp,'agent'),PROBE_TRACE:trace,PROBE_STATE:state,PROBE_EFFECT:effect,PROBE_PHASE:phase,REQUIRE_SKILL:denied?'1':'0'},stdio:['ignore','pipe','pipe']});
   let bytes=0,overflow=false,timedOut=false;
   const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
   for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024){overflow=true;kill();}});
   const timer=setTimeout(()=>{timedOut=true;kill();},limit);
   let code;try{code=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});}finally{clearTimeout(timer);if(child.exitCode===null)kill();}
   record({type:'process_closed',targetPhase:phase,code,timedOut,overflow});return{code,timedOut,overflow};
  }
  const initial=await launch('initial','Complete logical step-7 with payload accepted.','probe/slow',mode==='timeout'?2000:10000);
  // Let the deliberately withheld tail attempt arrive after cancellation; no new process yet.
  await sleep(1100);
  const before=await rows();const denials=before.filter(r=>r.type==='early_denial');
  const early=denials.length===1&&denials[0].incomplete&&!tailSent&&closed&&before.some(r=>r.type==='assistant_end'&&r.stopReason==='aborted')&&before.some(r=>r.type==='agent_end')&&!before.some(r=>['late_veto','identity_changed','implementation_entry'].includes(r.type))&&!initial.timedOut&&!initial.overflow;
  let correction=null;
  if(denied&&early){
   record({type:'settlement_verified',callId:denials[0].callId,tailSent});
   const provider=JSON.parse(await readFile(join(homedir(),'.pi/agent/models.json'),'utf8')).providers['clover-plexus'];
   const {resolveConfigValue}=await import('/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/resolve-config-value.js');
   const key=resolveConfigValue(provider.apiKey);if(!key)throw Error('Credential unavailable');
   await writeFile(join(temp,'agent/models.json'),JSON.stringify({providers:{'clover-plexus':{...provider,apiKey:key,models:provider.models.filter(m=>m.id==='astra')}}}),{mode:0o600});
   correction=await launch('correction','Original goal: complete logical step-7 with payload accepted. The prior Bash attempt was interrupted during incomplete argument generation because this step requires Skill instead of Bash. No tool executed. Correct that same step using Skill with skill="probe-skill", step_id="step-7", payload="accepted". Do not replay Bash. Stop after the tool succeeds.','clover-plexus/astra',90000);
  }
  const all=await rows();const entries=JSON.parse(await readFile(state,'utf8'));const artifact=await readFile(effect,'utf8').then(JSON.parse).catch(()=>null);
  const requestRows=all.filter(r=>r.phase==='correction'&&r.type==='provider_request');
  const context=requestRows.length>0&&JSON.stringify(requestRows[0].messages).includes('No tool executed')&&!requestRows[0].messages.some(m=>m.role==='tool'||m.tool_calls);
  const corrected=early&&correction?.code===0&&!correction.timedOut&&!correction.overflow&&context&&entries.Bash===0&&entries.Skill===1&&artifact?.tool==='Skill'&&artifact.step_id==='step-7'&&artifact.payload==='accepted'&&!all.some(r=>r.type==='late_veto');
  const allowed=!denials.length&&initial.code===0&&!initial.timedOut&&entries.Bash===1&&entries.Skill===0&&artifact?.tool==='Bash'&&tailSent;
  const interleaved=mode!=='interleaved'||(all.some(r=>r.type==='fragment'&&r.name==='Inspect'&&r.callId==='inspect-1')&&denials.every(r=>r.callId==='bash-1')&&entries.Inspect===0);
  const passed=mode==='timeout'?initial.timedOut&&entries.Bash===0&&entries.Skill===0&&!correction:denied?corrected&&interleaved:allowed;
  const summary={mode,passed,early,corrected,interleaved,initial,correction,entries,artifact,tailSent,closed,context,wholeRequestCancellation:mode==='interleaved'};
  await writeFile(join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({mode,passed,early,corrected,entries,out}));if(!passed)process.exitCode=1;
 }catch(e){record({type:'failure',kind:e.name});console.error(`Probe failure (${e.name}); sensitive exception text omitted`);process.exitCode=1;}
 finally{for(const t of timers)clearTimeout(t);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(temp,{recursive:true,force:true});record({type:'cleanup_complete'});}
}
