import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const phase = process.env.PROBE_PHASE;
const denied = process.env.REQUIRE_SKILL === '1';
const trace = process.env.PROBE_TRACE;
const record = row => appendFileSync(trace, JSON.stringify({ at: Date.now(), phase, ...row }) + '\n');
const parameters = { type: 'object', properties: {
  step_id: { type: 'string' }, command: { type: 'string' },
  skill: { type: 'string' }, payload: { type: 'string' },
}, required: ['step_id'] };
const enter = name => {
  const state = JSON.parse(readFileSync(process.env.PROBE_STATE, 'utf8'));
  state[name] = (state[name] ?? 0) + 1;
  writeFileSync(process.env.PROBE_STATE, JSON.stringify(state));
};

export default function (pi) {
  const calls = new Map();
  let latched = false, requests = 0;
  pi.on('before_provider_request', (event, ctx) => {
    if (++requests > 4) { record({ type: 'request_limit' }); ctx.abort(); return; }
    // This isolated provider payload has only the fixture goal/tools/results.
    record({ type: 'provider_request', messages: event.payload.messages, tools: event.payload.tools });
  });
  pi.on('message_update', (event, ctx) => {
    if (phase !== 'initial') return;
    const update = event.assistantMessageEvent;
    if (!['toolcall_start', 'toolcall_delta', 'toolcall_end'].includes(update.type)) return;
    const block = event.message.content[update.contentIndex];
    if (block?.type !== 'toolCall') return;
    let call = calls.get(update.contentIndex);
    if (!call) {
      call = { id: block.id, name: block.name, raw: '' };
      calls.set(update.contentIndex, call);
    }
    if (block.id !== call.id || block.name !== call.name) {
      record({ type: 'identity_changed', index: update.contentIndex }); ctx.abort(); return;
    }
    if (update.type === 'toolcall_delta') call.raw += update.delta;
    let complete = false;
    try { JSON.parse(call.raw); complete = true; } catch {}
    record({ type: 'fragment', event: update.type, index: update.contentIndex,
      callId: call.id, name: call.name, raw: call.raw, complete });
    if (latched || !call.id || update.type !== 'toolcall_delta' || !call.raw) return;
    if (denied && call.name === 'Bash') {
      latched = true;
      record({ type: 'early_denial', callId: call.id, index: update.contentIndex,
        incomplete: !complete, reason: 'This step requires Skill, not Bash; arguments cannot change this policy.' });
      record({ type: 'abort_requested', callId: call.id });
      ctx.abort();
    }
  });
  pi.on('tool_call', event => {
    record({ type: 'tool_call', callId: event.toolCallId, name: event.toolName, args: event.input });
    if (denied && event.toolName === 'Bash') {
      record({ type: 'late_veto', callId: event.toolCallId });
      return { block: true, reason: 'Use Skill for step-7, skill probe-skill, payload accepted.' };
    }
  });
  pi.on('message_end', event => {
    if (event.message.role === 'assistant') record({ type: 'assistant_end', stopReason: event.message.stopReason });
  });
  pi.on('agent_end', () => record({ type: 'agent_end' }));
  for (const name of ['Bash', 'Skill', 'Inspect']) {
    pi.registerTool({ name, label: name, parameters,
      description: name === 'Skill'
        ? 'Complete step-7 by invoking probe-skill with payload accepted. This replaces Bash for this step.'
        : name === 'Bash' ? 'Harmless fixture shell-action sentinel for an allowed step.' : 'Harmless fixture observation.',
      async execute(callId, args) {
        enter(name);
        record({ type: 'implementation_entry', name, callId, args });
        if (args.step_id !== 'step-7') throw Error('Wrong logical step');
        if (name === 'Skill' && (args.skill !== 'probe-skill' || args.payload !== 'accepted')) throw Error('Wrong skill/payload');
        if (name !== 'Inspect') writeFileSync(process.env.PROBE_EFFECT, JSON.stringify({ tool: name, ...args }));
        return { content: [{ type: 'text', text: `${name}: step-7 completed` }], details: undefined };
      },
    });
  }
}
