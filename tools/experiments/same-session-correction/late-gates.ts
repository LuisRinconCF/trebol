import { appendFileSync } from 'node:fs';
import { registerDiskHooks } from '../../../.pi/extensions/20-policy/swarm-disk-hooks.ts';
import { registerProjectInit } from '../../../.pi/extensions/20-policy/project-init.ts';
import { registerSwarmBash } from '../../../.pi/extensions/30-tools/swarm-bash.ts';
export default function(pi:any){
 const record=(x:any)=>appendFileSync(process.env.CORRECTION_TRACE!,JSON.stringify(x)+'\n');
 const observed=new Proxy(pi,{get(t,k){if(k==='registerTool')return(tool:any)=>t.registerTool({...tool,async execute(id:any,input:any,...rest:any[]){record({type:'entry',tool:tool.name,input});return tool.execute(id,input,...rest);}}); const v=t[k];return typeof v==='function'?v.bind(t):v;}});
 if(process.env.GATE==='disk')registerDiskHooks(observed);else registerProjectInit(observed);
 registerSwarmBash(observed);
 pi.on('before_provider_request',(e:any)=>record({type:'request',messages:e.payload.messages}));
}
