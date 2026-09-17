import { parseDate } from './dates.js';
import { validateBean } from './validation.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exact(object, keys) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object,key))) throw new Error('バックアップの項目が正しくありません。');
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !parseDate(value.slice(0,10)) || !Number.isFinite(Date.parse(value))) throw new Error('日時が正しくありません。');
  const [hours,minutes,seconds]=value.slice(11,19).split(':').map(Number);
  const offset=value.endsWith('Z')?null:value.slice(-5).split(':').map(Number);
  if(hours>23||minutes>59||seconds>59||(offset&&(offset[0]>23||offset[1]>59))) throw new Error('日時が正しくありません。');
  const normalized=new Date(value).toISOString();
  if(!parseDate(normalized.slice(0,10))) throw new Error('日時が範囲外です。');
  return normalized;
}
export function validateBackup(data) {
  exact(data,['schemaVersion','exportedAt','beans','presets']);
  if(data.schemaVersion!==1) throw new Error('対応していないバックアップ形式です。');
  if(!Array.isArray(data.beans)||!Array.isArray(data.presets)) throw new Error('データ一覧が正しくありません。');
  const ids = new Set(), names = new Set();
  const beans=data.beans.map(bean=>{
    exact(bean,['id','name','roastType','roastValue','roastCustom','roastDate','createdAt','status','finishedAt']);
    if(typeof bean.id!=='string'||!uuid.test(bean.id)||ids.has(bean.id.toLowerCase())) throw new Error('豆のIDが不正または重複しています。');
    ids.add(bean.id.toLowerCase());
    const fields=validateBean(bean,'9999-12-31');
    if(bean.name!==fields.name || bean.roastValue!==fields.roastValue || bean.roastCustom!==fields.roastCustom) throw new Error('豆の値に不整合があります。');
    if(!['active','archived'].includes(bean.status) || (bean.status==='active' && bean.finishedAt!==null)) throw new Error('豆の状態が正しくありません。');
    return {...bean,createdAt:timestamp(bean.createdAt),finishedAt:bean.status==='archived'?timestamp(bean.finishedAt):null};
  });
  ids.clear();
  const presets=data.presets.map(preset=>{
    exact(preset,['id','name']);
    if(typeof preset.id!=='string'||!uuid.test(preset.id)||ids.has(preset.id.toLowerCase())) throw new Error('プリセットのIDが不正または重複しています。');
    if(typeof preset.name!=='string'||!preset.name.trim()||preset.name!==preset.name.trim()||names.has(preset.name)) throw new Error('プリセット名が不正または重複しています。');
    ids.add(preset.id.toLowerCase());names.add(preset.name);return {...preset};
  });
  return {schemaVersion:1,exportedAt:timestamp(data.exportedAt),beans,presets};
}
export function parseBackup(text) {
  let data;try {data=JSON.parse(text);} catch {throw new Error('JSONファイルを読み込めませんでした。');}
  return validateBackup(data);
}
export function serializeBackup(snapshot) {return JSON.stringify(validateBackup({schemaVersion:1,exportedAt:new Date().toISOString(),...snapshot}),null,2);}
export function counts(data) {return {active:data.beans.filter(b=>b.status==='active').length,archived:data.beans.filter(b=>b.status==='archived').length,presets:data.presets.length};}
