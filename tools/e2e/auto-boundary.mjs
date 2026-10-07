#!/usr/bin/env node
/** Real Pi session and loopback scripted provider; no personal settings or paid API. */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePiHost } from "../install/pi-host.mjs";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const root = mkdtempSync(join(tmpdir(), "trebol-auto-boundary-"));
let session, requests = 0;
const server = createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests++;
  const text = requests === 1 ? "First step checked. <!-- pi-swarm:auto-continue -->" : "Finished; no further action.";
  const base = { id: "local-proof", object: "chat.completion.chunk", created: 1, model: body.model };
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const [delta, finish_reason] of [[{role:"assistant",content:text},null],[{},"stop"]]) res.write(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason}]})}\n\n`);
  res.end("data: [DONE]\n\n");
});
const deadline = setTimeout(() => { console.error("FAIL auto boundary timed out"); process.exit(1); }, 30_000);
try {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  execFileSync("git", ["init", "-q", root]);
  const agentDir = join(root, "agent"); mkdirSync(agentDir);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({defaultProvider:"local",defaultModel:"script"}));
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({providers:{local:{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,api:"openai-completions",apiKey:"dummy",models:[{id:"script",contextWindow:100000,maxTokens:1024,reasoning:false}]}}}));
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } = await import(resolvePiHost().sdkUrl);
  const settingsManager = SettingsManager.create(root, agentDir);
  const resourceLoader = new DefaultResourceLoader({cwd:root,agentDir,settingsManager,noExtensions:true,noSkills:true,noThemes:true,noContextFiles:true,noPromptTemplates:true,additionalExtensionPaths:[join(repo,"extensions/swarm-auto/index.ts")]});
  await resourceLoader.reload(); assert.deepEqual(resourceLoader.getExtensions().errors, []);
  ({session} = await createAgentSession({cwd:root,agentDir,settingsManager,resourceLoader,sessionManager:SessionManager.inMemory(root)}));
  const errors = []; await session.bindExtensions({onError:e=>errors.push(e)});
  await session.prompt("/auto on");
  await session.prompt("Perform the local verification steps, then stop.");
  assert.equal(requests, 2, "native continuation adds exactly one provider request");
  await new Promise(r=>setTimeout(r,400)); assert.equal(requests, 2, "no late timer wakeup");
  await session.prompt("/auto off");
  assert.deepEqual(errors, []);
  console.log("PASS actual Pi: auto on -> two model requests -> settles once; no delayed wake; auto off");
} finally {
  clearTimeout(deadline); session?.dispose();
  await new Promise(r=>server.close(r)); rmSync(root,{recursive:true,force:true});
}
