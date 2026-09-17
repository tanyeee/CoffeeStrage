import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, ageDays, ageLabel, today, sortBeans } from '../dates.js';

test('real dates only, including leap years and years below 100', () => {
  for (const value of ['2025-02-29','1900-02-29','2026-04-31','0000-01-01','2026-1-01','',null]) assert.equal(parseDate(value),null);
  for (const value of ['2000-02-29','2024-02-29','0001-01-01','0099-12-31']) assert.ok(parseDate(value));
  assert.equal(ageDays('0099-12-31','0100-01-01'),1);
});
test('calendar-day differences and month-end anniversaries', () => {
  for (const [a,b,days,label] of [
    ['2026-09-17','2026-09-17',0,'0日'],
    ['2025-05-12','2026-09-17',493,'1年4ヶ月'],
    ['2026-01-31','2026-02-28',28,'1.0ヶ月'],
    ['2024-02-29','2025-02-28',365,'1年'],
    ['2026-01-31','2026-03-30',58,'1.9ヶ月'],
    ['2026-12-31','2027-01-01',1,'1日'],
    ['2026-03-07','2026-03-09',2,'2日'],
    ['2026-09-18','2026-09-17',-1,'焙煎日を確認']
  ]) { assert.equal(ageDays(a,b),days); assert.equal(ageLabel(a,b),label); }
});
test('today uses local calendar components', () => { const date=new Date(2026,8,17,0,5); assert.equal(today(date),'2026-09-17'); });
test('inventory order is oldest first and stable without mutating input', () => {
  const beans=[{id:'b',roastDate:'2026-01-01',createdAt:'2026-02-02'},{id:'c',roastDate:'2025-01-01',createdAt:'2026-02-01'},{id:'a',roastDate:'2026-01-01',createdAt:'2026-02-02'}];
  assert.deepEqual(sortBeans(beans).map(b=>b.id),['c','a','b']); assert.equal(beans[0].id,'b');
});
