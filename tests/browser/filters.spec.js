import {test,expect} from '@playwright/test';

async function add(repo,name,roastDate,notes='',openedDate=null){
 const bean=await repo.add({name,roastDate,roastType:'scale',roastValue:2,roastCustom:null,notes});
 if(openedDate)await repo.setOpened(bean.id,openedDate);
 return bean;
}

test('inventory opened filters work alongside archive search',async({page})=>{
 await page.clock.install({time:new Date('2026-03-01T12:00:00+09:00')});await page.goto('/');
 await expect(page.locator('#inventory-count')).toContainText('現在の貯蔵数 0袋');
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const repo=createRepository();
  await repo.add({name:'エチオピア｜花の豆',roastDate:'2025-01-01',roastType:'scale',roastValue:2,roastCustom:null,notes:'柑橘の香り'});
  const opened=await repo.add({name:'ケニア｜甘い豆',roastDate:'2026-02-02',roastType:'scale',roastValue:3,roastCustom:null,notes:'友人と飲む'});await repo.setOpened(opened.id,'unknown');
  await repo.add({name:'ブラジル｜未開封',roastDate:'2025-02-01',roastType:'scale',roastValue:3,roastCustom:null,notes:'ナッツの香り'});await repo.close();
 });await page.reload();
 await expect(page.getByRole('heading',{name:'在庫'})).toHaveCount(1);
 await expect(page.locator('#inventory-count')).toBeVisible();await expect(page.locator('#inventory-count')).toContainText('現在の貯蔵数 3袋');
 await expect(page.getByLabel('豆名・備考を検索')).toHaveCount(0);
 await expect(page.locator('[data-opened-filter]')).toHaveText(['すべて','開封','未開封']);
 await expect(page.locator('[data-opened-filter="all"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByLabel('期間').locator('option')).toHaveText(['全期間','1ヶ月以上','半年以上']);
 await expect(page.getByLabel('並び順').locator('option')).toHaveText(['豆別','古い順','新しい順']);
 await page.getByRole('button',{name:'開封',exact:true}).click();await expect(page.locator('.batch-row')).toHaveCount(1);await expect(page.locator('.bean-group')).toContainText('ケニア');
 await page.getByRole('button',{name:'未開封',exact:true}).click();await expect(page.locator('.batch-row')).toHaveCount(2);
 await page.getByRole('button',{name:'すべて',exact:true}).click();await expect(page.locator('.batch-row')).toHaveCount(3);
 await page.getByLabel('期間').selectOption('1');await expect(page.locator('.batch-row')).toHaveCount(2);
 await page.getByRole('button',{name:'開封',exact:true}).click();await expect(page.locator('.batch-row')).toHaveCount(0);
 await expect(page.locator('.result-count')).toContainText('該当 0 / 3袋');
 await page.getByLabel('期間').selectOption('0');await expect(page.locator('.batch-row')).toHaveCount(1);
 await page.getByRole('button',{name:'すべて',exact:true}).click();await expect(page.locator('.batch-row')).toHaveCount(3);
 await page.setViewportSize({width:320,height:720});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const countBox=await page.locator('#inventory-count').boundingBox(),brandBox=await page.locator('.brand-name').boundingBox();
 expect(countBox.x).toBeGreaterThan(brandBox.x);expect(countBox.x+countBox.width).toBeLessThanOrEqual(320);
 await page.screenshot({path:'test-results/inventory-filters-mobile.png',fullPage:true});
 await page.locator('.batch-row').first().click();await page.getByRole('button',{name:'アーカイブへ移す'}).click();
 await page.getByRole('button',{name:'飲み切った',exact:true}).click();await expect(page.locator('#inventory-count')).toBeHidden();
 await page.getByRole('link',{name:'在庫',exact:true}).click();await expect(page.locator('#inventory-count')).toContainText('現在の貯蔵数 2袋');
 await page.getByRole('link',{name:'アーカイブ',exact:true}).click();
 await expect(page.locator('#inventory-count')).toBeHidden();await expect(page.getByLabel('豆名・備考を検索')).toHaveAttribute('placeholder','検索');
 await page.getByLabel('豆名・備考を検索').fill('田中');await expect(page.locator('.bean-group')).toHaveCount(0);
 await page.getByLabel('豆名・備考を検索').fill('');await expect(page.locator('.bean-group')).toHaveCount(0);
 await page.getByRole('link',{name:'設定',exact:true}).click();await expect(page.locator('#inventory-count')).toBeHidden();
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
 await page.getByLabel('並び順').selectOption('grouped');await expect(page.locator('.bean-group')).toHaveCount(2);await expect(page.getByLabel('豆を選択')).toBeVisible();await page.screenshot({path:'test-results/archive-filters-mobile.png',fullPage:true});
 const beanBox=await page.getByLabel('豆を選択').boundingBox(),sortBox=await page.getByLabel('並び順').boundingBox();
 expect(beanBox.y).toBe(sortBox.y);expect(beanBox.x).toBeLessThan(sortBox.x);
});
