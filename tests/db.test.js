import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createRepository } from '../db.js';

const input = { name:'Guji', roastType:'scale', roastValue:2, roastCustom:null, roastDate:'2025-05-12' };
const make = () => createRepository({factory:new IDBFactory(),name:'test-cellar'});
test('duplicate bags persist across reconnect and editing preserves lifecycle fields', async()=>{
  const repo=make();
  const a=await repo.add(input),b=await repo.add(input);
  assert.notEqual(a.id,b.id);
  await repo.close();
  assert.equal((await repo.list()).length,2);
  const edited=await repo.edit(a.id,{...input,name:'Nyeri',createdAt:'bad',status:'archived'});
  assert.equal(edited.name,'Nyeri');assert.equal(edited.createdAt,a.createdAt);assert.equal(edited.status,'active');
  const finished=await repo.finish(a.id);
  assert.equal(finished.status,'archived');assert.ok(finished.finishedAt);assert.equal(finished.finishedReason,'consumed');
  assert.equal((await repo.finish(a.id)).finishedAt,finished.finishedAt);
  const archivedEdit=await repo.edit(a.id,{...input,name:'Edited archive'});
  assert.equal(archivedEdit.status,'archived');assert.equal(archivedEdit.finishedAt,finished.finishedAt);
  await repo.close();assert.equal((await repo.get(a.id)).name,'Edited archive');
  await repo.remove(a.id);assert.equal(await repo.get(a.id),undefined);assert.equal((await repo.list()).length,1);
  await repo.close();
});
test('active deletion, invalid input and editing deleted records cannot change data', async()=>{
  const repo=make(),a=await repo.add(input);
  await assert.rejects(repo.remove(a.id));assert.equal((await repo.list()).length,1);
  await assert.rejects(repo.edit(a.id,{...input,name:' '}));assert.equal((await repo.get(a.id)).name,'Guji');
  await repo.finish(a.id);await repo.remove(a.id);
  await assert.rejects(repo.edit(a.id,input));assert.equal((await repo.list()).length,0);
  await repo.close();
});
test('unavailable storage rejects instead of pretending to save',async()=>{
  const repo=createRepository({factory:null});await assert.rejects(repo.add(input),/端末内保存/);
});
test('a transaction abort rejects even when its write request succeeded',async()=>{
  const factory=new IDBFactory(),repo=createRepository({factory,name:'abort-test'});
  const db=await repo.open(), original=db.transaction.bind(db);
  db.transaction=(...args)=>{
    const tx=original(...args);
    if(args[1]==='readwrite') {
      const objectStore=tx.objectStore.bind(tx);
      tx.objectStore=(...storeArgs)=>{
        const store=objectStore(...storeArgs),add=store.add.bind(store);
        store.add=(...data)=>{ const request=add(...data);request.addEventListener('success',()=>tx.abort());return request; };
        return store;
      };
    }
    return tx;
  };
  await assert.rejects(repo.add(input));
  assert.equal((await repo.list()).length,0);
  await repo.close();
});

test('v1 upgrade adds menu presets once and preserves existing beans and presets',async()=>{
  const factory=new IDBFactory();
  const old=await new Promise((resolve,reject)=>{
    const request=factory.open('migration-test',1);
    request.onupgradeneeded=()=>{
      const beans=request.result.createObjectStore('beans',{keyPath:'id'});
      beans.createIndex('status','status');beans.createIndex('statusRoastDate',['status','roastDate']);
      request.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  await new Promise((resolve,reject)=>{
    const tx=old.transaction(['beans','presets'],'readwrite');
    tx.objectStore('beans').add({...input,id:'existing',createdAt:'2025-05-12T00:00:00Z',status:'active',finishedAt:null});
    tx.objectStore('presets').add({id:'existing-preset',name:'ブラジル キャラメラード'});
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });old.close();
  const repo=createRepository({factory,name:'migration-test'});
  assert.equal((await repo.listPresets()).length,9);
  assert.equal((await repo.listPresets()).find(p=>p.name==='ブラジル｜キャラメラード').id,'existing-preset');
  assert.equal((await repo.get('existing')).name,'Guji');
  const db=await repo.open();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('presets','readwrite');tx.objectStore('presets').delete('existing-preset');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
  await repo.close();assert.equal((await repo.listPresets()).length,8);await repo.close();
});

test('v2 menu migration preserves IDs, custom names, beans and deletions',async()=>{
 const factory=new IDBFactory();
 const db=await new Promise((resolve,reject)=>{
  const r=factory.open('v2-migration',2);r.onupgradeneeded=()=>{
   r.result.createObjectStore('beans',{keyPath:'id'});
   r.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});
  };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 await new Promise(resolve=>{const tx=db.transaction(['beans','presets'],'readwrite');tx.objectStore('presets').add({id:'a',name:'エチオピア イルガチェフィー G1 ブナブナ'});tx.objectStore('presets').add({id:'b',name:'マイカスタム'});tx.objectStore('beans').add({...input,id:'bean'});tx.oncomplete=resolve;});db.close();
 const repo=createRepository({factory,name:'v2-migration'});const rows=await repo.listPresets();assert.equal(rows.length,2);assert.equal(rows.find(p=>p.id==='a').name,'エチオピア｜イルガチェフィー G1 ブナブナ');assert.equal(rows.find(p=>p.id==='b').name,'マイカスタム');assert.equal((await repo.get('bean')).name,input.name);await repo.close();
});

test('opened dates persist, reject impossible values and survive a JSON round trip',async()=>{
 const {parseBackup,serializeBackup}=await import('../backup.js');
 const repo=make(),a=await repo.add(input),b=await repo.add(input);
 assert.equal(a.openedDate,null);
 assert.equal((await repo.setOpened(a.id,'2025-06-01')).openedDate,'2025-06-01');
 assert.equal((await repo.setOpened(b.id,'unknown')).openedDate,'unknown');
 await assert.rejects(repo.setOpened(a.id,'2025-05-11'),/焙煎日より前/);
 await assert.rejects(repo.setOpened(a.id,'9999-12-31'),/未来/);
 await assert.rejects(repo.setOpened(a.id,'2025-13-01'),/正しい開封日/);
 await repo.close();
 assert.equal((await repo.get(a.id)).openedDate,'2025-06-01');
 assert.equal((await repo.edit(a.id,{...input,name:'編集後'})).openedDate,'2025-06-01');
 assert.equal((await repo.setOpened(a.id,null)).openedDate,null);
 const snap=await repo.snapshot(),restored=parseBackup(serializeBackup(snap));
 await repo.replace(restored);assert.deepEqual(await repo.snapshot(),snap);
 await repo.close();
});
test('a v2 backup restores as unopened bags',async()=>{
 const {parseBackup}=await import('../backup.js');
 const id=crypto.randomUUID(),presetId=crypto.randomUUID();
 const old={schemaVersion:2,exportedAt:'2026-09-17T00:00:00Z',presets:[{id:presetId,name:'A',order:0}],
  beans:[{...input,id,name:'Guji',createdAt:'2025-01-01T00:00:00Z',status:'active',finishedAt:null,presetId:null}]};
 const upgraded=parseBackup(JSON.stringify(old));
 assert.equal(upgraded.schemaVersion,6);assert.equal(upgraded.beans[0].openedDate,null);assert.equal(upgraded.beans[0].finishedReason,null);assert.equal(upgraded.beans[0].purchaseDate,null);assert.equal(old.beans[0].openedDate,undefined);
});
test('finish reasons are validated, persist and do not change after archiving',async()=>{
 const repo=make(),a=await repo.add(input),b=await repo.add(input);
 await assert.rejects(repo.finish(a.id,'lost'),/終了区分/);assert.equal((await repo.get(a.id)).status,'active');
 const gifted=await repo.finish(a.id,'gifted');assert.equal(gifted.finishedReason,'gifted');
 assert.equal((await repo.finish(a.id,'discarded')).finishedReason,'gifted');
 assert.equal((await repo.edit(a.id,{...input,finishedReason:'discarded'})).finishedReason,'discarded');
 await assert.rejects(repo.edit(a.id,{...input,finishedReason:'lost'}),/終了区分/);
 assert.equal((await repo.finish(b.id,'discarded')).finishedReason,'discarded');await repo.close();
});
test('v6 database migration adds an unknown finish reason without changing notes',async()=>{
 const factory=new IDBFactory(),name='finish-reason-migration',id=crypto.randomUUID();
 const db=await new Promise((resolve,reject)=>{const r=factory.open(name,6);r.onupgradeneeded=()=>{r.result.createObjectStore('beans',{keyPath:'id'});r.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('beans','readwrite');tx.objectStore('beans').add({...input,id,createdAt:'2025-05-12T00:00:00Z',status:'archived',finishedAt:'2026-09-01T00:00:00Z',presetId:null,openedDate:null,notes:'以前の備考'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 const repo=createRepository({factory,name});const bean=await repo.get(id);assert.equal(bean.finishedReason,null);assert.equal(bean.notes,'以前の備考');await repo.close();
});

test('v7 migration adds recommendation defaults without changing existing beans and applies the blend roast limit',async()=>{
 const factory=new IDBFactory(),name='recommendations-v7-migration',id=crypto.randomUUID(),presetId=crypto.randomUUID();
 const old=await new Promise((resolve,reject)=>{const r=factory.open(name,7);r.onupgradeneeded=()=>{r.result.createObjectStore('beans',{keyPath:'id'}).createIndex('status','status');r.result.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const original={...input,id,createdAt:'2025-05-12T00:00:00.000Z',status:'archived',finishedAt:'2026-09-20T00:00:00.000Z',presetId,openedDate:'unknown',notes:'before'};
 await new Promise((resolve,reject)=>{const tx=old.transaction(['beans','presets'],'readwrite');tx.objectStore('beans').put(original);tx.objectStore('presets').put({id:presetId,name:'ブレンド｜フジタコーヒー',order:4});tx.objectStore('presets').put({id:'custom',name:'Custom',order:5});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});old.close();
 const repo=createRepository({factory,name});
 assert.deepEqual(await repo.get(id),{...original,purchaseDate:null,finishedReason:null});
 assert.deepEqual(await repo.getRecommendationSettings(),{observationStartDate:null,leadDays:14});
 const presets=await repo.listPresets();assert.deepEqual(presets.find(p=>p.id===presetId).allowedRoasts,[3]);assert.deepEqual(presets.find(p=>p.id==='custom').allowedRoasts,[1,2,3,4,5]);
 await repo.savePreset(presetId,'焙煎設定を保った改名');await repo.reorderPresets(['custom',presetId]);
 const renamed=(await repo.listPresets()).find(p=>p.id===presetId);assert.deepEqual(renamed.allowedRoasts,[3]);assert.equal(renamed.order,1);
 await repo.close();
});

test('purchase date is optional, validates on write, and survives an edit that omits the field',async()=>{
 const repo=make(),a=await repo.add(input);assert.equal(a.purchaseDate,null);
 assert.equal((await repo.edit(a.id,{...input,purchaseDate:'2026-09-20'})).purchaseDate,'2026-09-20');
 assert.equal((await repo.edit(a.id,input)).purchaseDate,'2026-09-20');
 await assert.rejects(repo.edit(a.id,{...input,purchaseDate:'2026-09-30'}),/未来の購入日/);
 await assert.rejects(repo.edit(a.id,{...input,purchaseDate:'2026-02-30'}),/正しい購入日/);
 assert.equal((await repo.get(a.id)).purchaseDate,'2026-09-20');await repo.close();
});
