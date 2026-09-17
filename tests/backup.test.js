import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRepository } from '../db.js';
import { parseBackup,serializeBackup,validateBackup } from '../backup.js';
import { ageDays } from '../dates.js';
const input={name:'豆「テスト」\n日本語',roastType:'custom',roastValue:null,roastCustom:'中深煎り',roastDate:'2025-01-01'};
const make=()=>createRepository({factory:new IDBFactory()});
test('JSON round trip preserves all stores, custom roast, archive and editable presets',async()=>{
 const repo=make();const a=await repo.add(input);await repo.add({...input,roastType:'scale',roastValue:3});await repo.finish(a.id);
 const p=await repo.savePreset(null,' Original ');await repo.savePreset(p.id,'Revised');
 const snapshot=await repo.snapshot();const backup=parseBackup(serializeBackup(snapshot));
 await repo.savePreset(null,'Temporary');await repo.replace(backup);
 assert.deepEqual(await repo.snapshot(),snapshot);assert.equal((await repo.get(a.id)).name,input.name);
 await assert.rejects(repo.savePreset(null,'Revised'));
 await repo.removePreset(p.id);assert.equal((await repo.get(a.id)).name,input.name);await repo.close();
});
test('reject malformed backup, unknown keys/version, invalid values and duplicate IDs before mutation',async()=>{
 const repo=make();await repo.add(input);const before=await repo.snapshot();const valid=parseBackup(serializeBackup(before));
 const changes=[d=>d.schemaVersion=2,d=>d.extra=1,d=>d.beans.push(d.beans[0]),d=>d.beans[0].finishedAt='2026-01-01T00:00:00Z',d=>d.beans[0].roastValue=2,d=>d.beans[0].createdAt='2026-02-30T00:00:00Z',d=>d.beans[0].createdAt='2026-01-01T24:00:00Z',d=>d.presets.push({...d.presets[0],id:crypto.randomUUID()})];
 for(const change of changes){const data=structuredClone(valid);change(data);await assert.rejects(repo.replace(data));assert.deepEqual(await repo.snapshot(),before);}
 assert.throws(()=>parseBackup('{'));await repo.close();
});
test('replacement abort after successful clear and inserts rolls back both stores',async()=>{
 const repo=make();await repo.add(input);const before=await repo.snapshot();const replacement=parseBackup(serializeBackup(before));replacement.beans[0].name='replacement';replacement.presets=[];
 const db=await repo.open(),original=db.transaction.bind(db);
 db.transaction=(...args)=>{const tx=original(...args);if(args[1]==='readwrite'){
  const getStore=tx.objectStore.bind(tx);tx.objectStore=(name)=>{const store=getStore(name);const add=store.add.bind(store);store.add=(value)=>{const request=add(value);request.onsuccess=()=>tx.abort();return request;};return store;};
 }return tx;};
 await assert.rejects(repo.replace(replacement));assert.deepEqual(await repo.snapshot(),before);await repo.close();
});
test('empty restoration stays empty after reconnect; future dates remain restorable',async()=>{
 const repo=make();await repo.add(input);const data=parseBackup(serializeBackup(await repo.snapshot()));data.beans[0].roastDate='9999-12-31';assert.equal(validateBackup(data).beans[0].roastDate,'9999-12-31');
 await repo.replace({...data,beans:[],presets:[]});await repo.close();assert.deepEqual(await repo.snapshot(),{beans:[],presets:[]});await repo.close();
});
test('filter boundaries use exact calendar days',()=>{
 for(const n of [179,180,364,365,547,548]){
  const end=new Date('2026-09-17T00:00:00Z');end.setUTCDate(end.getUTCDate()-n);
  assert.equal(ageDays(end.toISOString().slice(0,10),'2026-09-17'),n);
 }
});
