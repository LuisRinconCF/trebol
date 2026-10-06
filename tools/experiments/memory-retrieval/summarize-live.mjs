#!/usr/bin/env node
// Read actual JSONL receipts; do not turn absence of a child into a success.
import { readFileSync } from 'node:fs';
const files=process.argv.slice(2);
if(!files.length)throw Error('Usage: node summarize-live.mjs artifacts/memory-retrieval/live-five-*/results.jsonl');
const rows=files.flatMap(file=>readFileSync(file,'utf8').split('\n').filter(Boolean).map(JSON.parse));
for(const row of rows){
 const cards=row.trace?.snapshotCards?.map(c=>c.id).join(',')??'-';
 const selected=row.result?.knowledge?.map(c=>c.id).join(',')??'-';
 const receipt=row.trace?.receipt?.selected?.map(c=>c.key).join(',')??'-';
 console.log([row.method,row.example,row.expected,row.result?.status??row.result?.error,cards,selected,receipt,row.elapsedMs??'-',row.trace?.exit??'-'].join('\t'));
}
