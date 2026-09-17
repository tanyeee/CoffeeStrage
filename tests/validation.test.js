import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBean, ValidationError } from '../validation.js';
const input={name:' Guji ',roastType:'scale',roastValue:2,roastCustom:'unused',roastDate:'2026-09-17'};
test('normalizes only editable fields and clears the inactive roast representation',()=>{
  const result=validateBean({...input,status:'archived',id:'injected'},'2026-09-17');
  assert.equal(result.name,'Guji');assert.equal(result.roastCustom,null);assert.equal(result.status,undefined);assert.equal(result.id,undefined);
  const custom=validateBean({...input,roastType:'custom',roastCustom:' 中深煎り '},'2026-09-17');
  assert.equal(custom.roastValue,null);assert.equal(custom.roastCustom,'中深煎り');
});
test('rejects missing, invalid, and future inputs',()=>{
  for(const patch of [{name:'　 '},{roastDate:'2026-09-18'},{roastDate:'2026-02-30'},{roastType:''},{roastValue:0},{roastValue:6},{roastValue:2.5},{roastValue:'2'},{roastType:'custom',roastCustom:' '}]) assert.throws(()=>validateBean({...input,...patch},'2026-09-17'),ValidationError);
});
