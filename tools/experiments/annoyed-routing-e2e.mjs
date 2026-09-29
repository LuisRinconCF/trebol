#!/usr/bin/env node
/* Real installed Pi tool execution + isolated judge provider + fake gh. */
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const root = await mkdtemp(join(tmpdir(), 'annoyed-routing-e2e-'));
const home = join(root, 'home'), agent = join(home, '.pi', 'agent');
const workspace = join(root, 'workspace'), sessions = join(root, 'sessions');
const rows = [], children = []; let mode = 'harness', providerRequests = [], ghCalls = [];
const bodyOf = req => new Promise((ok, bad) => { let body=''; req.on('data', c => body += c); req.on('end', () => ok(body)); req.on('error', bad); });
let provider;
let cancelJudgeStarted, releaseCancelledJudge;
  const judgeAnswers = { harness:{scope:'harness',reason:'Runtime defect'}, project:{scope:'project',reason:'Active project defect'}, uncertain:{scope:'uncertain',reason:'Ownership unclear'}, upstream:{scope:'upstream',reason:'Dependency defect'}, non_actionable:{scope:'non_actionable',reason:'No product defect'}, malformed:'not json' };
function rpcResponse(res, body, tool) {
  res.writeHead(200, {'content-type':'text/event-stream','connection':'close'});
  const delta = tool ? {role:'assistant',tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.args)}}]} : {role:'assistant',content:'E2E_DONE'};
  const base={id:`e2e-${providerRequests.length}`,object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:tool?'tool_calls':null}]};
  res.write(`data: ${JSON.stringify(base)}\n\n`);
  if (!tool) res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\n`);
  res.end('data: [DONE]\n\n');
}
try {
  await Promise.all([mkdir(agent,{recursive:true}),mkdir(workspace,{recursive:true}),mkdir(sessions,{recursive:true})]);
  provider=createServer(async(req,res)=>{
    const body=JSON.parse(await bodyOf(req)); providerRequests.push(body);
    if (body.messages?.some(m=>JSON.stringify(m).includes('Classify ownership'))) {
      if (mode === 'cancel-recovery') {
        cancelJudgeStarted?.();
        releaseCancelledJudge = () => res.end();
        return;
      }
      const answer=judgeAnswers[mode] ?? judgeAnswers.uncertain; res.writeHead(200,{'content-type':'text/event-stream','connection':'close'});
      const content=mode==='malformed'?'{':JSON.stringify(answer),base={id:`judge-${providerRequests.length}`,object:'chat.completion.chunk',created:1,model:body.model};
      res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content},finish_reason:null}]})}\n\n`);
      res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\n`);return res.end('data: [DONE]\n\n');
    }
    const calls=(body.messages??[]).filter(m=>m.role==='tool').length;
    if (!body.tools?.some(t=>t.function?.name==='annoyed')||calls>=(mode==='repeat'?2:1)) return rpcResponse(res,body,null);
    return rpcResponse(res,body,{id:'annoyed-call',name:'annoyed',args:{issue:`${mode} test issue`,category:'tool_failure',observed:'Observed fixture defect; token=ghp_abcdefghijklmnop123456' ,expected:'expected behavior',evidence:['e2e fixture'],acceptance_tests:['passes']} });
  });
  await new Promise((ok,bad)=>{provider.once('error',bad);provider.listen(0,'127.0.0.1',ok);});
  await writeFile(join(agent,'models.json'),JSON.stringify({providers:{local:{baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,api:'openai-completions',apiKey:'local-only',models:[{id:'script',name:'script',reasoning:false,contextWindow:100000,maxTokens:2048}]}}}));
  await writeFile(join(agent,'settings.json'),JSON.stringify({packages:[repo]}));
  const fakeBin=join(root,'bin'); await mkdir(fakeBin);
  const fakeGh=join(fakeBin,'gh');
  await writeFile(fakeGh,`#!/usr/bin/env node
let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{
const fs=require('node:fs'),a=process.argv.slice(2),api=a[0]==='api',method=a[a.indexOf('--method')+1],endpoint=a.find(x=>x.startsWith('repos/'))||'',repo=endpoint.replace(/^repos\\//,'').replace(/\\/issues.*$/,'');
const body=JSON.parse(s||'{}');fs.appendFileSync(process.env.FAKE_GH_LOG,JSON.stringify({args:a,body})+'\\n');
if(a[0]==='repo'){let r=a[2];if(process.env.FIXTURE_REMOTE==='ssh')r='acme/ssh-project';console.log(r);return}
if(method==='POST'){
const record={repo,body:body.body,number:7,state:process.env.FIXTURE_CLOSED==='1'?'closed':'open',html_url:process.env.FIXTURE_WRONG_URL==='1'?'https://github.com/other/wrong/issues/9':'https://github.com/'+repo+'/issues/7'};
fs.writeFileSync(process.env.FIXTURE_ISSUE_STATE,JSON.stringify(record));
if(process.env.FIXTURE_AMBIGUOUS==='1')process.exit(1);
console.log(JSON.stringify({number:7,html_url:process.env.FIXTURE_WRONG_URL==='1'?'https://github.com/other/wrong/issues/9':'https://github.com/'+repo+'/issues/7'}));return}
if(method==='GET'){let item=JSON.parse(fs.readFileSync(process.env.FIXTURE_ISSUE_STATE,'utf8'));if(process.env.FIXTURE_NEAR_MATCH==='1')item.body='body with near-match only';console.log(JSON.stringify([[item]]));return}
});
`);
  const {chmod}=await import('node:fs/promises'); await chmod(fakeGh,0o755);
  const env={...process.env,HOME:home,PI_CODING_AGENT_DIR:agent,PI_OFFLINE:'1',SWARM_ANNOYED_JUDGE:'local/script',SWARM_ANNOYED_REPOSITORY:'cloverinternational/trebol',PATH:`${fakeBin}:${process.env.PATH}`,FAKE_GH_LOG:join(root,'gh.jsonl'),PI_SWARM_NO_HOOKS:'1'};
  const extension=join(repo,'.pi/extensions/30-tools/annoyed/index.ts');
  const startup=await new Promise((ok,bad)=>{const c=spawn('pi',['--mode','json','--provider','local','--model','script','--no-extensions','--print','--','startup probe'],{cwd:workspace,env,stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.once('error',bad);c.once('exit',code=>code===0?ok({out,err}):bad(new Error(`provider startup failed ${code}: ${err}`))) });
  console.log(JSON.stringify({providerStartup:true}));
  const invoke=async(id,{remote=true,twice=false}={})=>{
    mode=id==='ssh-project'?'project':id; providerRequests=[]; ghCalls=[];
    const cwd=join(workspace,id); await mkdir(cwd,{recursive:true});
    if(remote) { const git=(args)=>new Promise((ok,bad)=>{const c=spawn('git',args,{cwd,stdio:'ignore'});c.once('error',bad);c.once('exit',code=>code===0?ok():bad(new Error('git init failed')))}); await git(['init']); await git(['remote','add','origin',id==='ssh-project'?'git@github.com:acme/ssh-project.git':'https://github.com/acme/project.git']); }
    const log=join(root,`${id}.gh.jsonl`); env.FAKE_GH_LOG=log; env.FIXTURE_ISSUE_STATE=join(root,`${id}.issue.json`); for(const key of ['FIXTURE_AMBIGUOUS','FIXTURE_CLOSED','FIXTURE_NEAR_MATCH','FIXTURE_WRONG_URL','FIXTURE_REMOTE']) delete env[key];
    if(id==='ambiguous-closed')Object.assign(env,{FIXTURE_AMBIGUOUS:'1',FIXTURE_CLOSED:'1'});
    if(id==='ambiguous-near-match')Object.assign(env,{FIXTURE_AMBIGUOUS:'1',FIXTURE_NEAR_MATCH:'1'});
    if(id==='wrong-url')env.FIXTURE_WRONG_URL='1'; if(id==='ssh-project')env.FIXTURE_REMOTE='ssh';
    const child=spawn('pi',['--mode','json','--provider','local','--model','script','--no-extensions','--extension',extension,'--no-context-files','--no-skills','--no-prompt-templates','--no-tools','--tools','annoyed','--session-dir',join(sessions,id),'--approve','--print','--','Please submit the approved annoyed report. PRIVATE_BRANCH_SENTINEL'],{cwd,env,stdio:['ignore','pipe','pipe']}); children.push(child);
    let stdout='',stderr='',pending=''; const events=[]; child.stdout.on('data',b=>{stdout+=b;pending+=b;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)try{events.push(JSON.parse(line))}catch{}});child.stderr.on('data',b=>stderr+=b);
    await new Promise((ok,bad)=>{const t=setTimeout(()=>{child.kill('SIGKILL');bad(new Error(`Pi timeout; requests=${providerRequests.length}; stderr=${stderr.slice(-1200)}`))},60000);child.once('error',bad);child.once('exit',code=>{clearTimeout(t);code===0?ok():bad(new Error(`Pi exit ${code}: ${stderr.slice(-1200)}`))})});
    const calls=(await readFile(log,'utf8').catch(()=>'' )).split('\n').filter(Boolean).map(JSON.parse);
    const sessionFiles=await readdir(join(sessions,id)); const saved=(await Promise.all(sessionFiles.filter(f=>f.endsWith('.jsonl')).map(f=>readFile(join(sessions,id,f),'utf8')))).join('\n');
    const toolMessages=events.filter(e=>e.type==='message_end'&&e.message?.role==='assistant').flatMap(e=>(e.message?.content??[]).filter(c=>c.type==='toolCall'&&c.name==='annoyed'));
    const judgeRequests=providerRequests.filter(r=>JSON.stringify(r.messages).includes('Classify ownership'));
    const result={id,judgeRequests:judgeRequests.length,providerRequests:providerRequests.length,ghCalls:calls,toolMessages,session:saved,transcriptLeaks: calls.some(c=>JSON.stringify(c.body).includes('PRIVATE_BRANCH_SENTINEL'))||JSON.stringify(toolMessages).includes('PRIVATE_BRANCH_SENTINEL'),judgeLeaks:judgeRequests.some(r=>JSON.stringify(r.messages).includes('PRIVATE_BRANCH_SENTINEL')),judgePrompt:providerRequests.find(r=>JSON.stringify(r.messages).includes('Classify ownership'))?.messages?.at(-1)?.content}; rows.push(result); console.log(JSON.stringify({...result,toolMessages:undefined,session:undefined,judgePrompt:undefined})); return result;
  };
  for(const id of ['harness','project','uncertain','upstream','non_actionable','malformed']) await invoke(id,{remote:id==='project'});
  await invoke('missing-remote',{remote:false});
  await invoke('repeat',{remote:false,twice:true});
  await invoke('ambiguous-closed',{remote:false});
  await invoke('ambiguous-near-match',{remote:false});
  await invoke('wrong-url',{remote:false});
  await invoke('ssh-project');
  const expected={harness:'cloverinternational/trebol',project:'acme/project',uncertain:'cloverinternational/trebol',upstream:'cloverinternational/trebol',non_actionable:'cloverinternational/trebol',malformed:'cloverinternational/trebol','missing-remote':'cloverinternational/trebol',repeat:'cloverinternational/trebol','ambiguous-closed':'cloverinternational/trebol','ambiguous-near-match':'cloverinternational/trebol','wrong-url':'cloverinternational/trebol','ssh-project':'acme/ssh-project'};
  for(const r of rows){const posts=r.ghCalls.filter(c=>c.args[0]==='api'&&c.args.includes('POST'));if(!posts.length||posts.some(c=>!c.args.includes(`repos/${expected[r.id]}/issues`)))throw new Error(`${r.id}: unexpected publication route`);if(r.judgeRequests!==1)throw new Error(`${r.id}: expected one judge, got ${r.judgeRequests}`);if(r.transcriptLeaks)throw new Error(`${r.id}: branch transcript leaked`);if(JSON.stringify(r.ghCalls).includes('ghp_abcdefghijklmnop123456'))throw new Error(`${r.id}: credential leaked`);if(r.judgeLeaks)throw new Error(`${r.id}: transcript was sent to isolated judge`);if(r.id==='repeat'&&posts.length!==1)throw new Error(`repeat: expected one publication, got ${posts.length}`);}
  const concurrency=async()=>{
    mode='concurrent';providerRequests=[];const cwd=join(workspace,'concurrent');await mkdir(cwd,{recursive:true});const log=join(root,'concurrent.gh.jsonl');env.FAKE_GH_LOG=log;env.FIXTURE_ISSUE_STATE=join(root,'concurrent.issue.json');for(const key of ['FIXTURE_AMBIGUOUS','FIXTURE_CLOSED','FIXTURE_NEAR_MATCH','FIXTURE_WRONG_URL','FIXTURE_REMOTE'])delete env[key];
    const runPi=()=>new Promise((ok,bad)=>{const child=spawn('pi',['--mode','json','--provider','local','--model','script','--no-extensions','--extension',extension,'--no-context-files','--no-skills','--no-prompt-templates','--no-tools','--tools','annoyed','--session-dir',join(sessions,`concurrent-${Math.random()}`),'--approve','--print','--','Please submit concurrent report.'],{cwd,env,stdio:['ignore','pipe','pipe']});children.push(child);let stderr='';child.stderr.on('data',b=>stderr+=b);child.once('error',bad);child.once('exit',code=>code===0?ok():bad(new Error(`concurrent Pi exit ${code}: ${stderr.slice(-1000)}`)))});
    await Promise.all([runPi(),runPi()]);const calls=(await readFile(log,'utf8').catch(()=>'' )).split('\n').filter(Boolean).map(JSON.parse),posts=calls.filter(c=>c.args.includes('--method')&&c.args.includes('POST'));
    if(posts.length!==1)throw new Error(`concurrent reports: expected one POST, got ${posts.length}`);if(providerRequests.filter(r=>JSON.stringify(r.messages).includes('Classify ownership')).length!==1)throw new Error('concurrent reports: expected one judge request');
    const result={id:'concurrent',providerRequests:providerRequests.length,ghCalls:calls,judgeRequests:providerRequests.filter(r=>JSON.stringify(r.messages).includes('Classify ownership')).length};rows.push(result);return result;
  };
  await concurrency();
  // Actual RPC abort during a live judge, then a new explicit submission using
  // the same workspace/store. The second invocation must not consult again.
  mode='cancel-recovery'; providerRequests=[];
  const cancelCwd=join(workspace,'cancel-recovery'); await mkdir(cancelCwd,{recursive:true});
  const cancelLog=join(root,'cancel-recovery.gh.jsonl'); env.FAKE_GH_LOG=cancelLog;
  env.FIXTURE_ISSUE_STATE=join(root,'cancel-recovery.issue.json');
  const judgeStarted=new Promise(ok=>{cancelJudgeStarted=ok;});
  const rpc=spawn('pi',['--mode','rpc','--provider','local','--model','script','--no-extensions','--extension',extension,'--no-context-files','--no-skills','--no-prompt-templates','--no-tools','--tools','annoyed','--session-dir',join(sessions,'cancel-rpc')],{cwd:cancelCwd,env,stdio:['pipe','pipe','pipe']});children.push(rpc);
  let rpcOutput='';rpc.stdout.on('data',b=>rpcOutput+=b);rpc.stderr.resume();
  rpc.stdin.write(JSON.stringify({id:'cancel-prompt',type:'prompt',message:'Submit the report'})+'\n');
  const deadline=async(condition)=>{const end=Date.now()+15000;while(!condition()){if(Date.now()>end)throw new Error('RPC cancellation fixture deadline');await new Promise(ok=>setTimeout(ok,25));}};
  let judgeSeen=false; judgeStarted.then(()=>{judgeSeen=true;});
  await deadline(()=>judgeSeen);
  rpc.stdin.write(JSON.stringify({id:'cancel-abort',type:'abort'})+'\n');
  await deadline(()=>rpcOutput.includes('"type":"agent_settled"'));
  releaseCancelledJudge?.();
  const cancelCalls=(await readFile(cancelLog,'utf8').catch(()=>'' )).split('\n').filter(Boolean).map(JSON.parse);
  if(cancelCalls.some(c=>c.args.includes('POST')))throw new Error('cancelled judge dispatched POST');
  const cancelledJudges=providerRequests.filter(r=>JSON.stringify(r.messages).includes('Classify ownership')).length;
  rpc.kill('SIGTERM');await new Promise(ok=>rpc.once('exit',ok));
  const resumed=await invoke('cancel-recovery',{remote:false});
  if(cancelledJudges!==1||resumed.judgeRequests!==0||resumed.ghCalls.filter(c=>c.args.includes('POST')).length!==1||!resumed.session.includes('Judge interrupted'))throw new Error('cancel recovery did not reuse uncertain verdict with one publication');
  for(const id of ['ambiguous-closed','ambiguous-near-match','wrong-url']){
    const r=rows.find(x=>x.id===id),calls=r.ghCalls,posts=calls.filter(c=>c.args.includes('--method')&&c.args.includes('POST')),gets=calls.filter(c=>c.args.includes('--method')&&c.args.includes('GET'));
    if(posts.length!==1||gets.length!==1)throw new Error(`${id}: expected one POST and one exact reconciliation GET`);
    const route='cloverinternational/trebol';if(!posts[0].args.includes(`repos/${route}/issues`))throw new Error(`${id}: wrong publication repository`);
    if(id==='ambiguous-near-match'&&calls.filter(c=>c.args.includes('POST')).length!==1)throw new Error('near-match: blind repost occurred');
    const toolText=JSON.stringify(r.session);
    if(id==='ambiguous-closed'&&(!toolText.includes('https://github.com/cloverinternational/trebol/issues/7')||!toolText.includes('publication_status')))throw new Error('ambiguous-closed: persisted result did not report confirmed issue URL');
    if(id==='ambiguous-near-match'&&(!toolText.includes('Error executing annoyed')||toolText.includes('https://github.com/cloverinternational/trebol/issues/7')))throw new Error('ambiguous-near-match: expected persisted tool error without issue URL');
    if(id==='wrong-url'&&(!toolText.includes('Error executing annoyed')||toolText.includes('https://github.com/other/wrong/issues/9')))throw new Error('wrong-url: expected rejected persisted tool result without untrusted URL');
  }
  const closed=rows.find(x=>x.id==='ambiguous-closed');if(!closed.ghCalls.some(c=>c.args.some(a=>a.includes('state=all'))&&c.args.includes('--slurp')&&c.args.includes('--paginate')))throw new Error('closed marker: expected paginated all-state reconciliation');
  if(closed.ghCalls.filter(c=>c.args.includes('POST')).length!==1)throw new Error('closed marker: expected no retry after reconciliation');
  const ssh=rows.find(x=>x.id==='ssh-project');if(!ssh.ghCalls.some(c=>c.args.includes('acme/ssh-project'))||!ssh.ghCalls.some(c=>c.args.includes('repos/acme/ssh-project/issues')))throw new Error('SSH project remote did not route to canonical verified project repository');
  console.log(JSON.stringify({summary:'PASS',scenarios:rows.length,concurrentPublications:rows.find(x=>x.id==='concurrent').ghCalls.filter(c=>c.args.includes('POST')).length}));
} catch(error){console.error(`annoyed-routing-e2e FAILED: ${error.stack||error}`);process.exitCode=1}
finally{for(const child of children)if(child.exitCode===null){child.kill('SIGKILL');await new Promise(ok=>child.once('exit',ok));}if(provider)await new Promise(ok=>provider.close(ok));await rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
