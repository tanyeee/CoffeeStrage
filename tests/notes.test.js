import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRepository } from '../db.js';
import { parseBackup, serializeBackup, serializeCSV } from '../backup.js';
import { validateBean } from '../validation.js';
const input={name:'備考の豆',roastType:'scale',roastValue:2,roastCustom:null,roastDate:'2025-01-01'};
const notes='9/22 友人に譲渡\n香りは「花」、甘みあり <b>感想</b>\n  余韻も長い  ';

test('notes belong to each bag and survive archive, preset rename, editing and backup restore',async()=>{
 const repo=createRepository({factory:new IDBFactory()});
 const preset=await repo.savePreset(null,input.name);
 const a=await repo.add({...input,notes}),b=await repo.add(input);
 assert.equal(b.notes,'');
 await repo.setOpened(a.id,'2025-02-01');
 const archived=await repo.finish(a.id);
 await repo.savePreset(preset.id,'変更した豆名');
 const renamed=await repo.get(a.id);assert.equal(renamed.notes,notes);
 const edited=await repo.edit(a.id,{...renamed,notes:notes+'\n追記'});
 assert.equal(edited.finishedAt,archived.finishedAt);assert.equal(edited.openedDate,'2025-02-01');assert.equal(edited.status,'archived');
 const {notes:omitted,...fields}=edited;
 assert.equal((await repo.edit(a.id,fields)).notes,edited.notes);
 const snapshot=await repo.snapshot();
 await repo.replace(parseBackup(serializeBackup(snapshot)));await repo.close();
 assert.deepEqual(await repo.snapshot(),snapshot);
 assert.equal((await repo.get(b.id)).notes,'');
 await repo.edit(a.id,{...edited,notes:''});assert.equal((await repo.get(a.id)).notes,'');await repo.close();
});

test('v5 migration only adds empty notes, preserving links, order, dates and lifecycle',async()=>{
 const factory=new IDBFactory(),name='notes-migration';
 const preset={id:crypto.randomUUID(),name:input.name,order:7};
 const base={...input,id:crypto.randomUUID(),createdAt:'2025-01-01T00:00:00.000Z',status:'archived',finishedAt:'2025-02-01T00:00:00.000Z',presetId:preset.id,openedDate:'unknown'};
 const beans=[base,{...base,id:crypto.randomUUID(),presetId:null,status:'active',finishedAt:null,openedDate:'2025-01-02'}];
 const old=await new Promise((resolve,reject)=>{
  const r=factory.open(name,5);r.onupgradeneeded=()=>{
   const store=r.result.createObjectStore('beans',{keyPath:'id'});beans.forEach(bean=>store.add(bean));
   r.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});r.transaction.objectStore('presets').add(preset);
  };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });old.close();
 const repo=createRepository({factory,name});
 for(const bean of beans)assert.deepEqual(await repo.get(bean.id),{...bean,notes:''});
 assert.deepEqual(await repo.listPresets(),[preset]);await repo.close();
 assert.equal((await repo.get(base.id)).notes,'');await repo.close();
});

test('v1-v3 backups migrate to empty notes without mutating the source',async()=>{
 const repo=createRepository({factory:new IDBFactory()});await repo.add(input);
 const latest=JSON.parse(serializeBackup(await repo.snapshot()));
 for(const version of [1,2,3]){
  const old=structuredClone(latest);old.schemaVersion=version;
  for(const bean of old.beans){delete bean.notes;if(version<3)delete bean.openedDate;if(version<2)delete bean.presetId;}
  if(version<2)for(const preset of old.presets)delete preset.order;
  const migrated=parseBackup(JSON.stringify(old));assert.equal(migrated.schemaVersion,4);assert.equal(migrated.beans[0].notes,'');assert.equal(old.beans[0].notes,undefined);
  await repo.replace(migrated);assert.equal((await repo.list())[0].notes,'');
 }
 for(const value of [null,42,{},[]]){
  const bad=structuredClone(latest);bad.beans[0].notes=value;
  assert.throws(()=>parseBackup(JSON.stringify(bad)),/備考/);
  assert.throws(()=>validateBean({...input,notes:value}));
 }
 const bad=structuredClone(latest);delete bad.beans[0].notes;assert.throws(()=>parseBackup(JSON.stringify(bad)));
 await repo.close();
});

test('CSV quotes multiline notes and neutralizes formula-like notes; JSON retains exact text',async()=>{
 const repo=createRepository({factory:new IDBFactory()});
 const a=await repo.add({...input,notes:'9/22 譲渡, "甘い"\n次回も購入'});
 const b=await repo.add({...input,notes:'  =1+1'});
 const csv=serializeCSV([a,b],'2026-09-22');
 assert.ok(csv.includes('"9/22 譲渡, ""甘い""\n次回も購入"'));
 assert.ok(csv.includes('"\'  =1+1"'));
 assert.deepEqual(parseBackup(serializeBackup(await repo.snapshot())).beans, (await repo.snapshot()).beans);
 await repo.close();
});
