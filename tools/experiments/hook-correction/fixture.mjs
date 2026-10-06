import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const parameters = {type:"object",properties:{step_id:{type:"string"},payload:{type:"object",properties:{value:{type:"string"}},required:["value"]}},required:["step_id","payload"]};

const stateFile = process.env.PROBE_STATE;
const traceFile = process.env.PROBE_TRACE;
const artifact = process.env.PROBE_ARTIFACT;
const mode = process.env.PROBE_MODE ?? 'block';
async function record(row) {
  await appendFile(traceFile, `${JSON.stringify(row)}\n`);
}
async function state(key, value) {
  const current = JSON.parse(await (await import('node:fs/promises')).readFile(stateFile, 'utf8'));
  current[key] = (current[key] ?? 0) + value;
  await writeFile(stateFile, JSON.stringify(current, null, 2));
}

export default function (pi) {
  let requests = 0;
  pi.on('before_provider_request', async (event, ctx) => {
    if (++requests > 6) { ctx.abort(); return; }
    const payload = event.payload;
    const messages = payload?.messages ?? payload?.input ?? [];
    const last = messages.slice(-3).map(m => ({ role: m.role, tool_call_id: m.tool_call_id, tool_calls: m.tool_calls, content: typeof m.content === 'string' ? m.content.slice(0, 300) : m.content }));
    await record({ type: 'provider_request', messages: last, tools: payload?.tools });
  });
  pi.on('tool_call', async event => {
    await record({ type: 'tool_call', tool: event.toolName, args: event.input, callId: event.toolCallId });
    if (event.toolName === 'wrong_step' && mode !== 'allow') {
      const reason = mode === 'repeat' ? 'DENIED: use right_step with this same step_id and payload {"value":"accepted"}.' : 'DENIED: wrong tool. Use right_step with this same step_id and payload {"value":"accepted"}.';
      await record({ type: 'denial', reason });
      return { block: true, reason };
    }
  });
  pi.registerTool({
    name: 'wrong_step', label: 'Wrong step', description: 'Incorrectly try to complete a workflow step.',
    parameters,
    async execute(_id, args) {
      await state('wrongEntries', 1);
      await record({ type: 'wrong_entry', args });
      return { details: undefined, content: [{ type: 'text', text: 'wrong tool executed' }] };
    },
  });
  pi.registerTool({
    name: 'right_step', label: 'Right step', description: 'Complete the workflow step using the correct action.',
    parameters,
    async execute(_id, args) {
      await state('rightEntries', 1);
      if (args.step_id !== 'step-7' || args.payload?.value !== 'accepted') throw new Error('invalid step or payload');
      await mkdir(path.dirname(artifact), { recursive: true });
      await writeFile(artifact, JSON.stringify({ step_id: args.step_id, payload: args.payload }));
      await record({ type: 'right_entry', args, artifact: path.basename(artifact) });
      return { details: undefined, content: [{ type: 'text', text: 'step-7 completed' }] };
    },
  });
}
