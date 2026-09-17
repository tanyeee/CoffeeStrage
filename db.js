import { validateBean } from './validation.js';
import { validateBackup } from './backup.js';
import { INITIAL_PRESETS, LEGACY_PRESETS } from './presets.js';

export function createRepository({ name = 'coffee-cellar', factory = globalThis.indexedDB, onBlocked = () => {}, onVersionChange = () => {} } = {}) {
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      if (!factory) return reject(new Error('このブラウザでは端末内保存を利用できません。'));
      const request = factory.open(name, 3);
      request.onblocked = onBlocked;
      request.onupgradeneeded = event => {
        const db = request.result;
        if (event.oldVersion < 1) {
        const beans = db.createObjectStore('beans', { keyPath: 'id' });
        beans.createIndex('status', 'status');
        beans.createIndex('statusRoastDate', ['status', 'roastDate']);
        db.createObjectStore('presets', { keyPath: 'id' }).createIndex('name', 'name', { unique: true });
        }
        if (event.oldVersion < 2) {
          const presets = request.transaction.objectStore('presets');
          for (const name of INITIAL_PRESETS) {
            const existing = presets.index('name').get(name);
            existing.onsuccess = () => {
              if (existing.result) return;
              const legacy = presets.index('name').get(LEGACY_PRESETS[INITIAL_PRESETS.indexOf(name)]);
              legacy.onsuccess = () => {
                if (!legacy.result) presets.add({ id: crypto.randomUUID(), name });
              };
            };
          }
        }
        if (event.oldVersion >= 1 && event.oldVersion < 3) {
          const store = request.transaction.objectStore('presets');
          // Only exact menu names migrate; custom names and previously deleted rows stay untouched.
          for (let i = 0; i < LEGACY_PRESETS.length; i++) {
            const old = store.index('name').get(LEGACY_PRESETS[i]);
            old.onsuccess = () => {
              if (!old.result) return;
              const target = store.index('name').get(INITIAL_PRESETS[i]);
              target.onsuccess = () => {
                if (!target.result) store.put({ ...old.result, name: INITIAL_PRESETS[i] });
              };
            };
          }
        }
      };
      request.onerror = () => { connection = undefined; reject(request.error); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; onVersionChange(); };
        db.onclose = () => { connection = undefined; };
        resolve(db);
      };
    });
    connection = connection.catch(error => { connection = undefined; throw error; });
    return connection;
  }
  async function transact(mode, operation, storeName = 'beans') {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('保存が中断されました。'));
      tx.onerror = () => {}; // The default error action aborts the complete transaction.
      const fail = error => { failure = error; tx.abort(); };
      try { operation(tx.objectStore(storeName), value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  }
  function mutate(id, change) {
    return transact('readwrite', (store, done, fail) => {
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('この豆は見つかりません。');
          const next = change(request.result);
          if (next === null) store.delete(id); else store.put(next);
          done(next);
        } catch (error) { fail(error); }
      };
    });
  }
  async function snapshot() {
    const db = await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['beans','presets'],'readonly');
      const beans=tx.objectStore('beans').getAll(), presets=tx.objectStore('presets').getAll();
      tx.oncomplete=()=>resolve({beans:beans.result,presets:presets.result});
      tx.onabort=()=>reject(tx.error || new Error('読み込みが中断されました。'));
    });
  }
  return {
    open, snapshot,
    async replace(data) {
      const valid=validateBackup(data),db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(['beans','presets'],'readwrite');
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error || new Error('復元が中断されました。現在のデータは保持されています。'));
        try {
          for(const key of ['beans','presets']) {
            const store=tx.objectStore(key);store.clear();
            for(const item of valid[key]) store.add(item);
          }
        } catch {tx.abort();}
      });
    },
    async savePreset(id, value) {
      const name=typeof value==='string'?value.trim():'';
      if(!name) throw new Error('プリセット名を入力してください。');
      return transact('readwrite',(store,done,fail)=>{
        const save=()=>{const item={id:id||crypto.randomUUID(),name};store.put(item);done(item);};
        if(!id) save();
        else {const request=store.get(id);request.onsuccess=()=>request.result?save():fail(new Error('プリセットが見つかりません。'));}
      },'presets');
    },
    removePreset: id => transact('readwrite',(store)=>{store.delete(id);},'presets'),
    listPresets: () => transact('readonly', (store, done) => {
      store.getAll().onsuccess = event => done(event.target.result.sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    }, 'presets'),
    list: () => transact('readonly', (store, done) => { store.getAll().onsuccess = event => done(event.target.result); }),
    get: id => transact('readonly', (store, done) => { store.get(id).onsuccess = event => done(event.target.result); }),
    async add(input) {
      const bean = { ...validateBean(input), id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'active', finishedAt: null };
      return transact('readwrite', (store, done) => { store.add(bean); done(bean); });
    },
    async edit(id, input) { const data = validateBean(input); return mutate(id, bean => ({ ...bean, ...data })); },
    finish: id => mutate(id, bean => bean.status === 'archived' ? bean : { ...bean, status: 'archived', finishedAt: new Date().toISOString() }),
    remove: id => mutate(id, bean => { if (bean.status !== 'archived') throw new Error('在庫の豆は完全削除できません。'); return null; }),
    async close() { (await open()).close(); connection = undefined; }
  };
}
