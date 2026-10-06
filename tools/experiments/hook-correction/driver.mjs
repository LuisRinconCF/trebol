#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const modes=process.argv.slice(2);
if(!modes.length||modes.some(x=>!['scripted','allow','invalid','repeat','timeout','real'].includes(x)))throw Error('Specify scripted allow invalid repeat timeout or real');
if(modes.filter(x=>x==='real').length>2)throw Error('At most two real runs');
const argsFor=(name,step='step-7')=>({name,arguments:{step_id:step,payload:{value:'accepted'}}});
for(const mode of modes){
 const temp=await mkdtemp(join(tmpdir(),'hook-correction-'));let server,child,timer;
 const out=join(repo,'artifacts/hook-correction',`${Date.now()}-${mode}`);
 await mkdir(out,{recursive:true});await mkdir(join(temp,'cwd'));await mkdir(join(temp,'agent'));
 const trace=join(out,'trace.jsonl'),state=join(temp,'state.json'),artifact=join(temp,'step.json');
 await writeFile(trace,'');await writeFile(state,JSON.stringify({wrongEntries:0,rightEntries:0}));
 try{
  let count=0,models;
  if(mode==='real'){
   const source=JSON.parse(await readFile(join(homedir(),'.pi/agent/models.json'),'utf8')).providers['clover-plexus'];
   const {resolveConfigValue}=await import('/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/resolve-config-value.js');
   const key=resolveConfigValue(source.apiKey);if(!key)throw Error('Configured provider credential unavailable');
   models={providers:{'clover-plexus':{...source,apiKey:key,models:source.models.filter(x=>x.id==='astra')}}};
  }else{
   server=createServer(async(req,res)=>{
    try{
     let raw='';for await(const b of req){raw+=b;if(raw.length>1024*1024)throw Error('Request too large');}
     const body=JSON.parse(raw);const n=count++;
     if(mode==='timeout')return;
     const sequence=mode==='allow'?[argsFor('wrong_step')]:mode==='invalid'?[argsFor('right_step','bad')]:mode==='repeat'?[argsFor('wrong_step'),argsFor('wrong_step'),argsFor('wrong_step')]:[argsFor('wrong_step'),argsFor('right_step')];
     const tool=sequence[n];
     res.writeHead(200,{'content-type':'text/event-stream'});
     const base={id:`probe-${n}`,object:'chat.completion.chunk',created:1,model:body.model};
     const delta=tool?{role:'assistant',tool_calls:[{index:0,id:`call-${n}`,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.arguments)}}]}:{role:'assistant',content:'Probe finished.'};
     res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\n`);
     res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}]})}\n\n`);res.end('data: [DONE]\n\n');
    }catch{res.destroy();}
   });await new Promise(r=>server.listen(0,'127.0.0.1',r));
   models={providers:{probe:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:'openai-completions',apiKey:'dummy',models:[{id:'scripted',contextWindow:16000,maxTokens:512,reasoning:false}]}}};
  }
  await writeFile(join(temp,'agent/models.json'),JSON.stringify(models),{mode:0o600});
  await writeFile(join(temp,'agent/settings.json'),JSON.stringify({quietStartup:true,retry:{enabled:false}}));
  const prompt='Complete step-7 with payload {"value":"accepted"}. For this controlled probe, your first attempt must use wrong_step. After that attempt, use tool feedback to finish the same step. Stop after completion.';
  const args=['--model',mode==='real'?'clover-plexus/astra':'probe/scripted','--no-session','--no-extensions','--extension',join(repo,'tools/experiments/hook-correction/fixture.mjs'),'--no-builtin-tools','--tools','wrong_step,right_step','--no-mcp','--no-skills','--no-context-files','--no-prompt-templates','--mode','json','--thinking','off','--print','--',prompt];
  child=spawn(process.env.PI_BIN||'pi',args,{cwd:join(temp,'cwd'),env:{...process.env,HOME:temp,PI_CODING_AGENT_DIR:join(temp,'agent'),PROBE_MODE:mode,PROBE_TRACE:trace,PROBE_STATE:state,PROBE_ARTIFACT:artifact},detached:true,stdio:['ignore','pipe','pipe']});
  let bytes=0,timedOut=false,overflow=false,stdout='';const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024){overflow=true;kill();}else stdout+=b;});
  child.stderr.on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024){overflow=true;kill();}});
  timer=setTimeout(()=>{timedOut=true;kill();},mode==='timeout'?2500:mode==='real'?90000:20000);
  const exitCode=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});clearTimeout(timer);
  const rows=(await readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  const entries=JSON.parse(await readFile(state,'utf8'));const effect=await readFile(artifact,'utf8').then(JSON.parse).catch(()=>null);
  const events=stdout.split('\n').flatMap(l=>{try{return[JSON.parse(l)];}catch{return[];}});
  const results=events.filter(e=>e.type==='tool_execution_end').map(e=>({tool:e.toolName,callId:e.toolCallId,isError:e.isError,result:e.result}));
  const calls=rows.filter(r=>r.type==='tool_call');const denialIndex=rows.findIndex(r=>r.type==='denial');
  const context=rows.slice(denialIndex+1).some(r=>r.type==='provider_request'&&r.messages.some(m=>m.role==='tool'&&JSON.stringify(m.content).includes('DENIED:')));
  const corrected=calls.length===2&&calls[0].tool==='wrong_step'&&calls[1].tool==='right_step'&&calls.every(c=>c.args.step_id==='step-7')&&entries.wrongEntries===0&&entries.rightEntries===1&&effect?.step_id==='step-7'&&effect?.payload?.value==='accepted'&&context&&results.length===2&&results[0].isError&&!results[1].isError;
  const passed=!overflow&&(mode==='timeout'?timedOut&&calls.length===0:exitCode===0&&!timedOut&&(mode==='allow'?entries.wrongEntries===1&&effect===null:mode==='invalid'?entries.rightEntries===1&&effect===null&&results[0]?.isError:mode==='repeat'?calls.length===3&&entries.wrongEntries===0&&effect===null:corrected));
  const report={mode,passed,exitCode,timedOut,overflow,model:mode==='real'?'clover-plexus/astra':'scripted',prompt,calls,results,entries,effect,denialInNextRequest:context,corrected};
  await writeFile(join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({mode,passed,out,entries,corrected}));if(!passed)process.exitCode=1;
 }catch(e){await writeFile(join(out,'error.json'),JSON.stringify({error:'Probe setup/execution failed',kind:e.name}));console.error(`Probe failed (${e.name}); no credential-bearing error text recorded`);process.exitCode=1;}
 finally{clearTimeout(timer);if(child&&child.exitCode===null)try{process.kill(-child.pid,'SIGKILL');}catch{}if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(temp,{recursive:true,force:true});}
}
