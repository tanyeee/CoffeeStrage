import { validateBean, validateOpened, validateFinishReason, validatePurchaseDate, validateRecommendationSettings, validatePresetRecommendationSettings } from './validation.js';
import { validateBackup } from './backup.js';
import { upgradeSnapshot, sortPresets, matchingPreset } from './data.js';

export function createRepository({ name = 'coffee-cellar', factory = globalThis.indexedDB, onBlocked = () => {}, onVersionChange = () => {} } = {}) {
  let connection;
  function open() {
    if(connection) return connection;
    connection = new Promise((resolve,reject)=>{
      if(!factory) return reject(new Error('このブラウザでは端末内保存を利用できません。'));
      const request=factory.open(name,8);
      request.onblocked=onBlocked;
      request.onupgradeneeded=event=>{
        const db=request.result, tx=request.transaction;
        if(event.oldVersion<1){
          const beans=db.createObjectStore('beans',{keyPath:'id'});
          beans.createIndex('status','status');beans.createIndex('statusRoastDate',['status','roastDate']);
          db.createObjectStore('presets',{keyPath:'id'}).createIndex('name','name',{unique:true});
        }
        if(event.oldVersion<8) db.createObjectStore('settings',{keyPath:'id'});
        const beans=tx.objectStore('beans').getAll(), presets=tx.objectStore('presets').getAll(), settings=tx.objectStore('settings').get('recommendations');
        let pending=3;
        const migrate=()=>{
          if(--pending) return;
          try {
            const snapshot={beans:beans.result,presets:presets.result};
            const data=event.oldVersion<4
              ? upgradeSnapshot(snapshot,{seed:event.oldVersion<2,normalize:event.oldVersion<3})
              : snapshot;
            data.beans=data.beans.map(bean=>({...bean,purchaseDate:bean.purchaseDate??null,openedDate:bean.openedDate??null,notes:bean.notes??'',finishedReason:bean.status==='archived'?(bean.finishedReason??null):null}));
            data.presets=data.presets.map(preset=>({...preset,...validatePresetRecommendationSettings({reserveBags:preset.reserveBags??0,allowedRoasts:preset.allowedRoasts??(preset.name==='ブレンド｜フジタコーヒー'||preset.name==='ブレンド フジタコーヒー'?[3]:[1,2,3,4,5])})}));
            for(const key of ['beans','presets']) for(const item of data[key]) tx.objectStore(key).put(item);
            const savedSettings=settings.result;
            tx.objectStore('settings').put(savedSettings?{id:'recommendations',...validateRecommendationSettings(savedSettings)}:{id:'recommendations',observationStartDate:null,leadDays:14});
          } catch {tx.abort();}
        };
        beans.onsuccess=migrate;presets.onsuccess=migrate;settings.onsuccess=migrate;
      };
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();connection=undefined;onVersionChange();};
        db.onclose=()=>{connection=undefined;};resolve(db);
      };
    }).catch(error=>{connection=undefined;throw error;});
    return connection;
  }
  async function transact(stores,mode,operation){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(stores,mode);let result,failure;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(failure||tx.error||new Error('処理が中断されました。データは変更されていません。'));
      const fail=error=>{failure=error;tx.abort();};
      try{operation(tx,value=>{result=value;},fail);}catch(error){fail(error);}
    });
  }
  function snapshot(){
    return transact(['beans','presets','settings'],'readonly',(tx,done)=>{
      const a=tx.objectStore('beans').getAll(),b=tx.objectStore('presets').getAll(),c=tx.objectStore('settings').get('recommendations');let pending=3;
      const finish=()=>{if(!--pending)done({beans:a.result,presets:b.result,recommendationSettings:{observationStartDate:c.result?.observationStartDate??null,leadDays:c.result?.leadDays??14}});};a.onsuccess=finish;b.onsuccess=finish;c.onsuccess=finish;
    });
  }
  function mutate(id,change){
    return transact(['beans'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('beans'),r=store.get(id);
      r.onsuccess=()=>{try{if(!r.result)throw new Error('この豆は見つかりません。');const next=change(r.result);if(next===null)store.delete(id);else store.put(next);done(next);}catch(error){fail(error);}};
    });
  }
  async function saveBean(id,input){
    const fields=validateBean(input);
    const purchaseDate=input.purchaseDate===undefined?undefined:validatePurchaseDate(input.purchaseDate);
    const finishedReason=input.finishedReason===undefined?undefined:input.finishedReason===null?null:validateFinishReason(input.finishedReason);
    return transact(['beans','presets'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('beans'),presets=tx.objectStore('presets').getAll();
      presets.onsuccess=()=>{
        const preset=matchingPreset(fields.name,presets.result);
        const save=old=>{
          const bean={...old,...fields,notes:input.notes===undefined?(old.notes??''):fields.notes,purchaseDate:purchaseDate===undefined?(old.purchaseDate??null):purchaseDate,presetId:preset?.id??null,...(old.status==='archived'&&finishedReason!==undefined?{finishedReason}:{})};
          if(id) store.put(bean);else store.add(bean);done(bean);
        };
        if(!id)save({id:crypto.randomUUID(),createdAt:new Date().toISOString(),status:'active',finishedAt:null,finishedReason:null,openedDate:null,purchaseDate:null});
        else {const r=store.get(id);r.onsuccess=()=>{if(!r.result)fail(new Error('この豆は見つかりません。'));else save(r.result);};}
      };
    });
  }
  return {
    open,snapshot,
    list:()=>transact(['beans'],'readonly',(tx,done)=>{tx.objectStore('beans').getAll().onsuccess=e=>done(e.target.result);}),
    get:id=>transact(['beans'],'readonly',(tx,done)=>{tx.objectStore('beans').get(id).onsuccess=e=>done(e.target.result);}),
    listPresets:()=>transact(['presets'],'readonly',(tx,done)=>{tx.objectStore('presets').getAll().onsuccess=e=>done(sortPresets(e.target.result));}),
    getRecommendationSettings:()=>transact(['settings'],'readonly',(tx,done)=>{tx.objectStore('settings').get('recommendations').onsuccess=e=>{const {observationStartDate=null,leadDays=14}=e.target.result||{};done({observationStartDate,leadDays});};}),
    saveRecommendationSettings:input=>transact(['settings'],'readwrite',(tx,done,fail)=>{try{const settings=validateRecommendationSettings(input);tx.objectStore('settings').put({id:'recommendations',...settings});done(settings);}catch(error){fail(error);}}),
    savePresetRecommendationSettings:(id,input)=>transact(['presets'],'readwrite',(tx,done,fail)=>{const store=tx.objectStore('presets'),request=store.get(id);request.onsuccess=()=>{try{if(!request.result)throw new Error('プリセットが見つかりません。');store.put({...request.result,...validatePresetRecommendationSettings(input)});done();}catch(error){fail(error);}};}),
    saveRecommendationConfiguration:(input,presetSettings)=>transact(['presets','settings'],'readwrite',(tx,done,fail)=>{
      try{
        const settings=validateRecommendationSettings(input),store=tx.objectStore('presets'),all=store.getAll();
        all.onsuccess=()=>{try{
          const updates=Object.entries(presetSettings||{}).map(([id,value])=>{const old=all.result.find(preset=>preset.id===id);if(!old)throw new Error('プリセット一覧が更新されています。再読み込みしてください。');return {...old,...validatePresetRecommendationSettings(value)};});
          updates.forEach(preset=>store.put(preset));tx.objectStore('settings').put({id:'recommendations',...settings});done(settings);
        }catch(error){fail(error);}};
      }catch(error){fail(error);}
    }),
    add:input=>saveBean(null,input),edit:saveBean,
    setOpened:(id,value)=>mutate(id,bean=>({...bean,openedDate:validateOpened(value,bean.roastDate)})),
    finish:(id,reason='consumed')=>mutate(id,bean=>bean.status==='archived'?bean:{...bean,status:'archived',finishedAt:new Date().toISOString(),finishedReason:validateFinishReason(reason)}),
    remove:id=>mutate(id,bean=>{if(bean.status!=='archived')throw new Error('在庫の豆は完全削除できません。');return null;}),
    async savePreset(id,value){
      const name=typeof value==='string'?value.trim():'';
      if(!name)throw new Error('プリセット名を入力してください。');
      return transact(['beans','presets'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('presets'),all=store.getAll();
        all.onsuccess=()=>{
          const old=all.result.find(p=>p.id===id);
          if(id&&!old)return fail(new Error('プリセットが見つかりません。'));
          const item={...old,id:id||crypto.randomUUID(),name,order:old?.order??(Math.max(-1,...all.result.map(p=>p.order))+1),reserveBags:old?.reserveBags??0,allowedRoasts:old?.allowedRoasts??(name==='ブレンド｜フジタコーヒー'?[3]:[1,2,3,4,5])};
          store.put(item);
          const beans=tx.objectStore('beans'),r=beans.getAll();
          r.onsuccess=()=>{for(const bean of r.result)if(bean.presetId===id&&id)beans.put({...bean,name});};
          done(item);
        };
      });
    },
    removePreset:id=>transact(['beans','presets'],'readwrite',(tx)=>{
      tx.objectStore('presets').delete(id);
      const store=tx.objectStore('beans');store.getAll().onsuccess=e=>{for(const bean of e.target.result)if(bean.presetId===id)store.put({...bean,presetId:null});};
    }),
    reorderPresets:ids=>transact(['presets'],'readwrite',(tx,done,fail)=>{
      const store=tx.objectStore('presets');store.getAll().onsuccess=e=>{
        const all=e.target.result;
        if(!Array.isArray(ids)||new Set(ids).size!==ids.length||all.length!==ids.length||all.some(p=>!ids.includes(p.id)))return fail(new Error('プリセットが変更されています。再読み込みして並べ替えてください。'));
        ids.forEach((id,order)=>store.put({...all.find(p=>p.id===id),order}));done();
      };
    }),
    async replace(data){
      const valid=validateBackup(data);
      return transact(['beans','presets','settings'],'readwrite',(tx)=>{
        for(const key of ['beans','presets']){const store=tx.objectStore(key);store.clear();for(const item of valid[key])store.add(item);}
        const settings=tx.objectStore('settings');settings.clear();settings.add({id:'recommendations',...valid.recommendationSettings});
      });
    },
    async close(){(await open()).close();connection=undefined;}
  };
}
