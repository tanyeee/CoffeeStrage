import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRepository } from '../db.js';
import { groupBeans } from '../data.js';
import { ageLabel, compactDate } from '../dates.js';
import { serializeBackup, parseBackup } from '../backup.js';
const input={roastDate:'2025-01-01',roastType:'scale',roastValue:2,roastCustom:null};
const make=()=>createRepository({factory:new IDBFactory()});
test('linked rename applies to active/archive, deletion detaches and preserves names',async()=>{
 const repo=make();const p=await repo.savePreset(null,'同じ豆');const a=await repo.add({...input,name:p.name});const b=await repo.add({...input,name:p.name});await repo.finish(b.id);
 const custom=await repo.add({...input,name:'同じ豆・別名'});assert.equal(a.presetId,p.id);
 await repo.savePreset(p.id,'新しい名前');assert.equal((await repo.get(a.id)).name,'新しい名前');assert.equal((await repo.get(b.id)).name,'新しい名前');assert.equal((await repo.get(custom.id)).name,'同じ豆・別名');
 const snapshot=await repo.snapshot();await assert.rejects(repo.savePreset(p.id,snapshot.presets.find(x=>x.id!==p.id).name));assert.deepEqual(await repo.snapshot(),snapshot);
 await repo.removePreset(p.id);assert.equal((await repo.get(a.id)).presetId,null);assert.equal((await repo.get(a.id)).name,'新しい名前');await repo.close();
});
test('manual order survives reconnect and JSON restore, groups sort presets then bags by age',async()=>{
 const repo=make();const p=await repo.savePreset(null,'A');const q=await repo.savePreset(null,'B');
 await repo.add({...input,name:p.name});await repo.add({...input,name:p.name,roastDate:'2026-01-01'});await repo.add({...input,name:q.name});await repo.add({...input,name:'自由入力'});
 const order=(await repo.listPresets()).map(x=>x.id);order.splice(order.indexOf(q.id),1);order.unshift(q.id);await repo.reorderPresets(order);
 await assert.rejects(repo.reorderPresets([q.id,q.id]));await repo.close();assert.equal((await repo.listPresets())[0].id,q.id);
 const snap=await repo.snapshot();const groups=groupBeans(snap.beans,snap.presets);assert.deepEqual(groups.map(g=>g.name),['B','A','自由入力']);assert.equal(groups[1].beans.length,2);assert.equal(groups[1].beans[0].roastDate,'2025-01-01');
 const backup=parseBackup(serializeBackup(snap));assert.equal(backup.schemaVersion,3);await repo.replace(backup);assert.deepEqual(await repo.snapshot(),snap);
 const bad=structuredClone(backup);bad.beans[0].presetId=crypto.randomUUID();await assert.rejects(repo.replace(bad));assert.deepEqual(await repo.snapshot(),snap);await repo.close();
});
test('old JSON upgrades legacy aliases and new order without losing records',async()=>{
 const id=crypto.randomUUID();const old={schemaVersion:1,exportedAt:'2026-09-17T00:00:00Z',presets:[{id,name:'エチオピア｜イルガチェフィー G1 ブナブナ'}],beans:[{...input,id:crypto.randomUUID(),name:'エチオピア イルガチェフィー G1 ブナブナ',createdAt:'2025-01-01T00:00:00Z',status:'active',finishedAt:null}]};
 const upgraded=parseBackup(JSON.stringify(old));assert.equal(upgraded.beans[0].presetId,id);assert.equal(upgraded.beans[0].name,old.presets[0].name);assert.equal(upgraded.presets[0].order,0);assert.equal(old.beans[0].presetId,undefined);
});
test('under-year labels include remainder across leap days and clipped month ends',()=>{
 assert.equal(ageLabel('2026-07-14','2026-09-17'),'2.1ヶ月');assert.equal(ageLabel('2026-01-31','2026-03-01'),'1.0ヶ月');assert.equal(ageLabel('2024-02-29','2025-02-27'),'11.9ヶ月');assert.equal(ageLabel('2024-02-29','2025-02-28'),'1年');assert.equal(compactDate('2025-02-14'),'25/2/14');
});
test('v3 migration links names/legacy aliases and keeps unknown names unlinked',async()=>{
 const factory=new IDBFactory();const db=await new Promise(resolve=>{const r=factory.open('old',3);r.onupgradeneeded=()=>{r.result.createObjectStore('beans',{keyPath:'id'});r.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});};r.onsuccess=()=>resolve(r.result);});
 await new Promise(resolve=>{const tx=db.transaction(['beans','presets'],'readwrite');tx.objectStore('presets').put({id:'p',name:'ブラジル｜キャラメラード'});tx.objectStore('beans').put({...input,id:'b',name:'ブラジル キャラメラード'});tx.objectStore('beans').put({...input,id:'c',name:'不明な豆'});tx.oncomplete=resolve;});db.close();
 const repo=createRepository({factory,name:'old'});assert.equal((await repo.get('b')).presetId,'p');assert.equal((await repo.get('b')).name,'ブラジル｜キャラメラード');assert.equal((await repo.get('c')).presetId,null);assert.equal((await repo.listPresets()).length,1);await repo.close();
});
