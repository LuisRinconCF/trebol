/** Real installed Pi host, deterministic local provider, isolated sessions. */
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const root = await mkdtemp(join(tmpdir(), 'mermaid-host-'));
const agent = join(root, 'agent');
const workspace = join(root, 'workspace');
const cases = [
  { id: 'missing', prompt: 'Explain how the skill budget hook works', first: 'The skill budget hook checks whether an agent has a focused task and counts attempts before executing actions. Once the limit is reached, the acting tool is blocked; the agent can invoke a relevant Skill and then retry its work.', second: 'The budget gate blocks the attempted tool, and successful Skill invocation resets the counter.\n\n```mermaid\nflowchart TD\nA["Tool attempt"] --> B["Budget gate"]\nB --> C["Invoke Skill"]\n```', follow: true },
  { id: 'present', prompt: 'Explain the skill budget hook with a diagram', first: 'The skill budget gate checks the limit before allowing the next action. Here is the tool transition:\n\n```mermaid\nflowchart TD\nA --> B\n```', follow: false },
  { id: 'routine', prompt: 'Fix the test and report results', first: 'I reviewed the fixture, updated the test, and checked the results. The assertions pass and the current changes are scoped to the expected files only.', follow: false },
  { id: 'bounded', prompt: 'Explain how the skill budget hook works', first: 'The skill budget hook checks whether an agent has a focused task and counts attempts before executing actions. Once the limit is reached, the acting tool is blocked; the agent can invoke a relevant Skill and then retry its work.', second: 'Here is another long explanation of the skill budget gate, but still no diagram. The first answer remains in session history and this follow-up must not cause an endless loop of provider calls.', follow: true },
  { id: 'reload-test', prompt: 'I reloaded you try to ignorre it and see if it catches you', first: 'The test deliberately omits a diagram even though the user asked the reloaded post-response hook to catch the omission. The hook should request one additional explanatory reply with a Mermaid diagram.', second: 'The post-response check sends a follow-up when the omission is observed.\n\n```mermaid\nflowchart TD\nA --> B\n```', follow: true },
];
let active, requests;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  const message = requests.length === 1 ? active.first : active.second;
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const base = { id: `script-${requests.length}`, object: 'chat.completion.chunk', created: 1, model: body.model };
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: message }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
let child;
try {
  await mkdir(agent, { recursive: true }); await mkdir(workspace, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await writeFile(join(agent, 'models.json'), JSON.stringify({ providers: { local: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'dummy', models: [{ id: 'script', contextWindow: 100000, maxTokens: 2048, reasoning: false }] } } }));
  for (const scenario of cases) {
    active = scenario; requests = [];
    const sessions = join(root, `sessions-${scenario.id}`); await mkdir(sessions);
    const args = ['--model', 'local/script', '--no-extensions', '--extension', join(repo, '.pi/extensions/10-context/mermaid-response.ts'), '--no-tools', '--no-skills', '--no-context-files', '--session-dir', sessions, '--mode', 'json', '--print', '--approve', '--', scenario.prompt];
    child = spawn('pi', args, { cwd: workspace, env: { ...process.env, HOME: root, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30000);
    const code = await new Promise(r => child.once('exit', r)); clearTimeout(timeout);
    const events = stdout.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const files = await readdir(sessions); const transcript = files.filter(f => f.endsWith('.jsonl')).map(async f => readFile(join(sessions, f), 'utf8'));
    const saved = (await Promise.all(transcript)).join('\n');
    const persisted = saved.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const assistantText = persisted.filter(e => e.type === 'message' && e.message?.role === 'assistant').map(e => e.message.content?.filter(p => p.type === 'text').map(p => p.text).join('\n') ?? '');
    const proof = { id: scenario.id, code, requests: requests.length, followPrompt: requests[1]?.messages?.some(m => JSON.stringify(m).includes('previous explanation omitted a Mermaid diagram')) ?? false, firstPersisted: assistantText[0] === scenario.first, secondPersisted: scenario.second ? assistantText[1] === scenario.second : false, savedFollowup: persisted.some(e => e.customType === 'pi-swarm-mermaid-followup'), persistedAssistantMessages: assistantText.length, generatedDiagram: assistantText[1]?.includes('```mermaid') ?? false, events: events.filter(e => e.type === 'message_end').map(e => e.message?.role), stderr: stderr.slice(0, 280) };
    console.log(JSON.stringify(proof));
    if (code !== 0 || requests.length !== (scenario.follow ? 2 : 1) || assistantText.length !== (scenario.follow ? 2 : 1) || !proof.firstPersisted || (scenario.follow && (!proof.followPrompt || !proof.secondPersisted || !proof.savedFollowup || proof.generatedDiagram !== (scenario.id !== 'bounded'))) || (!scenario.follow && proof.savedFollowup)) process.exitCode = 1;
    child = undefined;
  }
} finally { if (child && child.exitCode === null) child.kill('SIGKILL'); await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); }
