import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRepository } from '../db.js';
import { parseBackup,serializeBackup,validateBackup } from '../backup.js';
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
 const changes=[d=>d.schemaVersion=5,d=>d.beans[0].openedDate='2020-01-01',d=>d.beans[0].openedDate='開封済み',d=>d.extra=1,d=>d.beans.push(d.beans[0]),d=>d.beans[0].finishedAt='2026-01-01T00:00:00Z',d=>d.beans[0].roastValue=2,d=>d.beans[0].createdAt='2026-02-30T00:00:00Z',d=>d.beans[0].createdAt='2026-01-01T24:00:00Z',d=>d.presets.push({...d.presets[0],id:crypto.randomUUID()})];
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
test('filter boundaries use completed calendar months',async()=>{
 const {elapsedMonths}=await import('../dates.js');
 for(const [start,months] of [['2026-08-18',0],['2026-08-17',1],['2026-03-18',5],['2026-03-17',6],['2026-03-31',5],['2025-09-18',11]]) assert.equal(elapsedMonths(start,'2026-09-17'),months);
 assert.equal(elapsedMonths('2026-01-31','2026-02-27'),0);assert.equal(elapsedMonths('2026-01-31','2026-02-28'),1);
 assert.equal(elapsedMonths('2026-09-18','2026-09-17'),-1);
});

test('CSV includes both statuses, BOM, CRLF, quoted newlines and neutralized formulas',async()=>{
 const {serializeCSV}=await import('../backup.js');
 const bean={...input,id:'a',createdAt:'2025-01-01T00:00:00Z',status:'active',finishedAt:null,openedDate:null};
 const csv=serializeCSV([{...bean,name:'  =1+1'},{...bean,id:'b',name:'豆,"引用"\n次行',status:'archived',finishedAt:'2026-01-01T00:00:00.000Z',openedDate:'unknown'}],'2026-01-01');
 assert.ok(csv.startsWith('\uFEFFname,roast,roastDate,openedDate,ageDays,status,finishedAt,notes\r\n'));
 assert.ok(csv.includes('"\'  =1+1"'));assert.ok(csv.includes('"豆,""引用""\n次行"'));
 assert.ok(csv.includes('"",365,"active",""'));assert.ok(csv.includes('"unknown",365,"archived"'));assert.ok(csv.includes('"archived","2026-01-01T00:00:00.000Z"'));
});
