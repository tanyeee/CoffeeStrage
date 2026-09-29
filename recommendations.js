import { ageDays, parseDate } from './dates.js';
import { matchingPreset } from './data.js';

function presetFor(bean,presets) {
  return presets.find(preset=>preset.id===bean.presetId) || matchingPreset(bean.name,presets);
}
function localDay(timestamp) {
  const date=new Date(timestamp);
  if(!Number.isFinite(date.getTime()))return null;
  return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function beanPresetMap(beans,presets) {
  return new Map(beans.map(bean=>[bean,presetFor(bean,presets)?.id??null]));
}

export function recommendRestocks(beans,presets,settings,currentDate) {
  const observationStartDate=settings?.observationStartDate??null;
  if(!parseDate(currentDate))throw new Error('基準日が正しくありません。');
  const futureStart=Boolean(observationStartDate&&observationStartDate>currentDate);
  const hasObservation=Boolean(observationStartDate&&!futureStart);
  // Build the 90-day lower bound with UTC calendar arithmetic, independent of local DST.
  let effectiveStart=null,observationDays=0;
  if(hasObservation){
    const [year,month,day]=currentDate.split('-').map(Number),cutoff=new Date(0);
    cutoff.setUTCFullYear(year,month-1,day-89);cutoff.setUTCHours(0,0,0,0);
    const maxStart=`${String(cutoff.getUTCFullYear()).padStart(4,'0')}-${String(cutoff.getUTCMonth()+1).padStart(2,'0')}-${String(cutoff.getUTCDate()).padStart(2,'0')}`;
    effectiveStart=observationStartDate>maxStart?observationStartDate:maxStart;
    observationDays=ageDays(effectiveStart,currentDate)+1;
  }
  const presetIds=beanPresetMap(beans,presets), results=[], accumulating=[];
  for(const preset of presets){
    const related=beans.filter(bean=>presetIds.get(bean)===preset.id);
    const active=related.filter(bean=>bean.status==='active'), unopened=active.filter(bean=>bean.openedDate===null).length;
    const reserveBags=preset.reserveBags??0,shortfall=Math.max(0,reserveBags-unopened);
    const consumed=hasObservation?related.filter(bean=>{
      if(bean.status!=='archived'||bean.finishedReason!=='consumed'||!bean.finishedAt)return false;
      const ended=localDay(bean.finishedAt);return ended&&ended>=effectiveStart&&ended<=currentDate;
    }).length:0;
    const rateReady=Boolean(hasObservation&&observationDays>=30&&consumed>=3);
    if(hasObservation&&!rateReady&&(related.length>0||reserveBags>0))accumulating.push({presetId:preset.id,name:preset.name,days:observationDays,consumed});
    const reasons=[];
    if(shortfall)reasons.push({type:'reserve',unopened,target:reserveBags,shortfall});
    let estimatedDays=null;
    if(rateReady){
      const dailyRate=consumed/observationDays;
      estimatedDays=active.length/dailyRate;
      if(estimatedDays<=(settings?.leadDays??14))reasons.push({type:'pace',days:observationDays,consumed,stock:active.length,estimatedDays});
    }
    if(reasons.length)results.push({presetId:preset.id,name:preset.name,order:preset.order??Number.MAX_SAFE_INTEGER,reasons,estimatedDays});
  }
  results.sort((a,b)=>{
    const aReserve=a.reasons.find(reason=>reason.type==='reserve'),bReserve=b.reasons.find(reason=>reason.type==='reserve');
    if(Boolean(aReserve)!==Boolean(bReserve))return aReserve?-1:1;
    if(aReserve&&bReserve&&aReserve.shortfall!==bReserve.shortfall)return bReserve.shortfall-aReserve.shortfall;
    return (a.estimatedDays??Infinity)-(b.estimatedDays??Infinity)||a.order-b.order||a.name.localeCompare(b.name,'ja');
  });
  return {recommendations:results,accumulating,observation:{startDate:effectiveStart,days:observationDays,started:Boolean(observationStartDate),futureStart}};
}

export function recommendDiscoveries(beans,presets,{random=Math.random}={}) {
  const presetIds=beanPresetMap(beans,presets),candidates=[];
  const orderedPresets=[...presets].sort((a,b)=>(a.id||'').localeCompare(b.id||''));
  for(const preset of orderedPresets){
    const allowed=preset.allowedRoasts??[1,2,3,4,5];
    const linked=beans.filter(bean=>presetIds.get(bean)===preset.id),beanCount=linked.length;
    for(const roastValue of [...allowed].sort((a,b)=>a-b)){
      const comboCount=linked.filter(bean=>bean.roastType==='scale'&&bean.roastValue===roastValue).length;
      if(linked.some(bean=>bean.status==='active'&&bean.roastType==='scale'&&bean.roastValue===roastValue))continue;
      candidates.push({presetId:preset.id,name:preset.name,roastValue,beanCount,comboCount,weight:1/((1+beanCount)*(1+comboCount)),reason:comboCount===0?'この焙煎度は記録上初めてです':'記録が少ない組み合わせです'});
    }
  }
  candidates.sort((a,b)=>a.presetId.localeCompare(b.presetId)||a.roastValue-b.roastValue);
  const pick=pool=>{
    const total=pool.reduce((sum,item)=>sum+item.weight,0);
    let point=Math.min(.9999999999999999,Math.max(0,random()))*total;
    for(let index=0;index<pool.length;index++){point-=pool[index].weight;if(point<0)return pool[index];}
    return pool.at(-1);
  };
  if(!candidates.length)return [];
  const first=pick(candidates),remaining=candidates.filter(item=>item!==first);
  const diverse=remaining.some(item=>item.presetId!==first.presetId)?remaining.filter(item=>item.presetId!==first.presetId):remaining;
  return [first,...(diverse.length?[pick(diverse)]:[])];
}

export function seededRandom(seed) {
  let state=2166136261;
  for(const character of String(seed)){state^=character.charCodeAt(0);state=Math.imul(state,16777619);}
  return ()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};
}
