import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendDiscoveries,recommendRestocks,seededRandom } from '../recommendations.js';

const preset=(id,name=id,reserveBags=0,allowedRoasts=[1,2,3,4,5],order=0)=>({id,name,reserveBags,allowedRoasts,order});
const bean=(id,presetId,status='active',roastValue=2,openedDate=null,finishedReason=null,finishedAt=null)=>({id,presetId,name:presetId,roastType:'scale',roastValue,roastCustom:null,roastDate:'2026-01-01',createdAt:'2026-01-01T00:00:00Z',status,finishedAt,finishedReason,openedDate});
const setting=(observationStartDate=null,leadDays=14)=>({observationStartDate,leadDays});

test('manual unopened reserve works before history and ignores opened or unknown-date bags',()=>{
 const p=preset('p','エチオピア',1),rows=[bean('a','p','active',2,'2026-01-02'),bean('b','p','active',2,'unknown')];
 const result=recommendRestocks(rows,[p],setting(),'2026-09-29');
 assert.equal(result.recommendations.length,1);assert.deepEqual(result.recommendations[0].reasons,[{type:'reserve',unopened:0,target:1,shortfall:1}]);assert.equal(result.observation.started,false);
 assert.equal(recommendRestocks([...rows,bean('c','p')],[p],setting(),'2026-09-29').recommendations.length,0);
});

test('observed beans with no completed bags are reported as accumulating data',()=>{
 const p=preset('p'),stock=bean('stock','p');
 const result=recommendRestocks([stock],[p],setting('2026-09-01'),'2026-09-29');
 assert.deepEqual(result.accumulating,[{presetId:'p',name:'p',days:29,consumed:0}]);
});

test('pace needs 30 observed days and three consumed bags, excludes gifts and dates outside the window',()=>{
 const p=preset('p','ケニア'),ended=(id,reason,date)=>({...bean(id,'p','archived',2,'2026-01-02',reason,`${date}T02:00:00+09:00`)});
 const stock=bean('stock','p');
 const enough=[ended('c1','consumed','2026-09-01'),ended('c2','consumed','2026-09-10'),ended('c3','consumed','2026-09-20'),ended('gift','gifted','2026-09-21'),ended('discard','discarded','2026-09-22'),ended('unknown',null,'2026-09-23')];
 const start='2026-08-31';
 let result=recommendRestocks([stock,...enough],[p],setting(start,14),'2026-09-29');
 assert.equal(result.observation.days,30);assert.equal(result.recommendations[0].estimatedDays,10);assert.equal(result.recommendations[0].reasons.find(x=>x.type==='pace').consumed,3);
 result=recommendRestocks([stock,...enough],[p],setting('2026-09-01',14),'2026-09-29');assert.equal(result.observation.days,29);assert.equal(result.recommendations.length,0);assert.equal(result.accumulating[0].consumed,3);
 result=recommendRestocks([stock,...enough.slice(0,2)],[p],setting('2026-08-31',14),'2026-09-29');assert.equal(result.recommendations.length,0);assert.equal(result.accumulating[0].consumed,2);
});

test('pace threshold uses active bag count and rounds only the displayed estimate',()=>{
 const p=preset('p'),archived=Array.from({length:3},(_,i)=>bean(`c${i}`,'p','archived',2,null,'consumed',`2026-09-0${i+1}T12:00:00+09:00`));
 const rows=[bean('a','p'),...archived];
 assert.equal(recommendRestocks(rows,[p],setting('2026-08-31',14),'2026-09-29').recommendations[0].estimatedDays,10);
 assert.equal(recommendRestocks([...rows,bean('b','p')],[p],setting('2026-08-31',14),'2026-09-29').recommendations.length,0);
});

test('caps observation window at 90 days and ignores future completion records',()=>{
 const p=preset('p'),rows=Array.from({length:4},(_,i)=>bean(`c${i}`,'p','archived',2,null,'consumed',`2026-09-${String(1+i).padStart(2,'0')}T12:00:00+09:00`));
 rows.push(bean('future','p','archived',2,null,'consumed','2026-09-30T12:00:00+09:00'));
 const result=recommendRestocks(rows,[p],setting('2026-01-01'),'2026-09-29');assert.equal(result.observation.days,90);assert.equal(result.recommendations[0].reasons.find(x=>x.type==='pace').consumed,4);
 const future=recommendRestocks(rows,[p],setting('2026-10-01'),'2026-09-29');assert.equal(future.observation.futureStart,true);assert.equal(future.recommendations.length,0);
});

test('discoveries honor roast constraints, active stock exclusion, and repeatable weighted draws',()=>{
 const presets=[preset('b','B',0,[3]),preset('a','A',0,[1,2])],rows=[bean('old','a','archived',1,null,'consumed','2026-01-01T00:00:00Z'),bean('active','b')];
 const first=recommendDiscoveries(rows,presets,{random:()=>0});assert.equal(first.length,2);assert.deepEqual(first.map(x=>[x.presetId,x.roastValue]),[['a',1],['b',3]]);
 const next=recommendDiscoveries(rows,presets,{random:()=>0.999999});assert.equal(next.length,2);assert.notDeepEqual(next.map(x=>[x.presetId,x.roastValue]),first.map(x=>[x.presetId,x.roastValue]));
 const only=preset('single','Blend',0,[3]);assert.deepEqual(recommendDiscoveries([bean('has','single','active',3)],[only]),[]);
 assert.deepEqual(recommendDiscoveries([],[],{}),[]);
});

test('discovery excludes matching active bean and chooses different presets when possible',()=>{
 const presets=[preset('a'),preset('b')],rows=[bean('stock','a','active',1)];
 const result=recommendDiscoveries(rows,presets,{random:()=>0});assert.equal(result.length,2);assert.equal(result[0].presetId,'a');assert.notEqual(result[0].roastValue,1);assert.notEqual(result[1].presetId,result[0].presetId);
});

test('seeded suggestion random stream is stable for the same daily refresh counter',()=>{
 const get=()=>recommendDiscoveries([], [preset('a'),preset('b')],{random:seededRandom('2026-09-29:0')}).map(item=>[item.presetId,item.roastValue]);
 assert.deepEqual(get(),get());assert.notDeepEqual(get(),recommendDiscoveries([], [preset('a'),preset('b')],{random:seededRandom('2026-09-29:1')}).map(item=>[item.presetId,item.roastValue]));
});
