import {test,expect} from '@playwright/test';

async function add(repo,name,roastDate,notes='',openedDate=null){
 const bean=await repo.add({name,roastDate,roastType:'scale',roastValue:2,roastCustom:null,notes});
 if(openedDate)await repo.setOpened(bean.id,openedDate);
 return bean;
}

test('inventory searches names and notes and filters opened state',async({page})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const repo=createRepository();
  await repo.add({name:'エチオピア｜花の豆',roastDate:'2025-01-01',roastType:'scale',roastValue:2,roastCustom:null,notes:'柑橘の香り'});
  const opened=await repo.add({name:'ケニア｜甘い豆',roastDate:'2025-02-01',roastType:'scale',roastValue:3,roastCustom:null,notes:'友人と飲む'});await repo.setOpened(opened.id,'2025-02-10');await repo.close();
 });await page.reload();
 await page.getByLabel('開封状態').selectOption('unopened');await expect(page.locator('.batch-row')).toHaveCount(1);await expect(page.locator('.bean-group')).toContainText('エチオピア');
 await page.getByLabel('開封状態').selectOption('opened');await expect(page.locator('.batch-row')).toHaveCount(1);await expect(page.locator('.bean-group')).toContainText('ケニア');
 await page.getByLabel('開封状態').selectOption('all');
 await page.getByLabel('豆名・備考を検索').fill('友人');await expect(page.locator('.bean-group')).toHaveCount(1);await expect(page.locator('.bean-group')).toContainText('ケニア');
 await page.getByLabel('豆名・備考を検索').fill('存在しない');await expect(page.getByRole('heading',{name:'条件に合う豆はありません'})).toBeVisible();
 await page.getByLabel('豆名・備考を検索').fill('');await expect(page.locator('.bean-group')).toHaveCount(2);
});

test('archive groups beans and combines bean, period, reason and text filters',async({page})=>{
 await page.clock.install({time:new Date('2026-03-01T12:00:00+09:00')});await page.goto('/');
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const repo=createRepository();
  const p=await repo.savePreset(null,'エチオピア｜履歴用');
  const old=await repo.add({name:p.name,roastDate:'2025-01-01',roastType:'scale',roastValue:2,roastCustom:null,notes:'チョコの味'});await repo.finish(old.id,'consumed');await repo.close();
 });
 await page.clock.setSystemTime(new Date('2026-09-17T12:00:00+09:00'));
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const repo=createRepository();const p=(await repo.listPresets()).find(item=>item.name==='エチオピア｜履歴用');
  const gift=await repo.add({name:p.name,roastDate:'2026-01-01',roastType:'scale',roastValue:3,roastCustom:null,notes:'田中さんへ'});await repo.finish(gift.id,'gifted');
  const discarded=await repo.add({name:'ケニア｜別の豆',roastDate:'2026-02-01',roastType:'scale',roastValue:4,roastCustom:null,notes:'欠点豆'});await repo.finish(discarded.id,'discarded');await repo.close();
 });
 await page.getByRole('link',{name:'アーカイブ',exact:true}).click();
 await expect(page.getByLabel('並び順')).toHaveValue('grouped');await expect(page.locator('.bean-group')).toHaveCount(2);
 const ethiopia=page.locator('.bean-group').filter({hasText:'エチオピア｜履歴用'});await expect(ethiopia.locator('.batch-row')).toHaveCount(2);await expect(ethiopia.locator('.batch-opened').first()).toHaveText('26/9/17');
 await page.getByLabel('豆を選択').selectOption({label:'エチオピア｜履歴用'});await expect(page.locator('.bean-group')).toHaveCount(1);await expect(page.locator('.batch-row')).toHaveCount(2);
 await page.getByLabel('終了期間').selectOption('3');await expect(page.locator('.batch-row')).toHaveCount(1);
 await page.getByLabel('終了期間').selectOption('0');await page.getByLabel('終了区分').selectOption('consumed');await expect(page.locator('.batch-row')).toHaveCount(1);await expect(page.locator('.batch-opened')).toHaveText('26/3/1');
 await page.getByLabel('終了区分').selectOption('all');await page.getByLabel('豆を選択').selectOption('');await page.getByLabel('豆名・備考を検索').fill('田中');await expect(page.locator('.batch-row')).toHaveCount(1);
 await page.getByLabel('豆名・備考を検索').fill('');await page.getByLabel('並び順').selectOption('oldest');await expect(page.locator('.bean-card').first()).toContainText('2026/03/01');
 await page.getByLabel('並び順').selectOption('newest');await expect(page.locator('.bean-card').first()).toContainText('2026/09/17');
 await page.setViewportSize({width:320,height:720});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('並び順').selectOption('grouped');await page.screenshot({path:'test-results/archive-filters-mobile.png',fullPage:true});
});
