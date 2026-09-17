import { INITIAL_PRESETS, LEGACY_PRESETS } from './presets.js';
import { sortBeans } from './dates.js';

export function sortPresets(presets) {
  return [...presets].sort((a,b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name,'ja') || a.id.localeCompare(b.id));
}
export function matchingPreset(name, presets, legacy = false) {
  const exact = presets.find(p => p.name === name);
  if (exact || !legacy) return exact;
  const i = LEGACY_PRESETS.indexOf(name);
  return i < 0 ? undefined : presets.find(p => p.name === INITIAL_PRESETS[i]);
}
export function upgradeSnapshot(snapshot, { seed = false, normalize = false } = {}) {
  let presets = snapshot.presets.map(p => ({...p}));
  if (normalize) {
    for (const p of presets) {
      const i = LEGACY_PRESETS.indexOf(p.name);
      if(i >= 0 && !presets.some(other => other.name === INITIAL_PRESETS[i])) p.name = INITIAL_PRESETS[i];
    }
  }
  if (seed) {
    for (const name of INITIAL_PRESETS) {
      if(!presets.some(p=>p.name===name)) presets.push({id:crypto.randomUUID(),name});
    }
  }
  presets = sortPresets(presets).map((p,order)=>({...p,order}));
  const beans = snapshot.beans.map(bean=>{
    const preset = matchingPreset(bean.name,presets,true);
    return {...bean, presetId:preset?.id ?? null, name:preset?.name ?? bean.name};
  });
  return {beans,presets};
}
export function groupBeans(beans,presets) {
  const groups = new Map();
  for(const bean of sortBeans(beans)) {
    const preset = presets.find(p=>p.id===bean.presetId) || matchingPreset(bean.name,presets);
    const key = `name:${bean.name}`;
    if(!groups.has(key)) groups.set(key,{key,name:preset?.name ?? bean.name,presetId:preset?.id ?? null,beans:[]});
    groups.get(key).beans.push(bean);
  }
  const rank = new Map(sortPresets(presets).map((p,i)=>[p.id,i]));
  return [...groups.values()].sort((a,b)=>(rank.get(a.presetId)??Infinity)-(rank.get(b.presetId)??Infinity) || a.beans[0].roastDate.localeCompare(b.beans[0].roastDate) || a.name.localeCompare(b.name,'ja'));
}
