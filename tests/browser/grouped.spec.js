import {test,expect} from '@playwright/test';
async function seed(page){
 await page.goto('/');await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const repo=createRepository();
  const a=await repo.savePreset(null,'エチオピア｜イルガチェフィー'),b=await repo.savePreset(null,'ケニア｜マサイ');
  for(const [p,date] of [[a,'2025-02-14'],[a,'2026-07-14'],[b,'2025-08-01']])await repo.add({name:p.name,roastDate:date,roastType:'scale',roastValue:2,roastCustom:null});
  const all=await repo.listPresets();await repo.reorderPresets([a.id,b.id,...all.filter(p=>![a.id,b.id].includes(p.id)).map(p=>p.id)]);await repo.close();
 });await page.reload();
}
test('grouped inventory shows one compact row per bag, switches order and follows preset renames',async({page})=>{
 await page.clock.install({time:new Date('2026-09-17T12:00:00+09:00')});await seed(page);
 await expect(page.locator('.bean-group')).toHaveCount(2);await expect(page.locator('.bean-group').first().locator('.batch-row')).toHaveCount(2);
 await expect(page.locator('.batch-age').nth(1)).toHaveText('2.1ヶ月');await expect(page.locator('.batch-row time').first()).toHaveText('25/2/14');await expect(page.locator('.batch-roast').first()).toHaveText('2');
 const heights=await page.locator('.batch-row').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));expect(Math.max(...heights)).toBeLessThan(55);
 await page.screenshot({path:'test-results/grouped-mobile.png',fullPage:true});
 await page.getByLabel('並び順').selectOption('newest');await expect(page.locator('.bean-card').first()).toContainText('2026/07/14');
 await page.getByLabel('並び順').selectOption('oldest');await expect(page.locator('.bean-card').first()).toContainText('2025/02/14');await expect(page.locator('.bean-card').first()).not.toContainText('日）');
 await page.getByLabel('並び順').selectOption('grouped');await page.locator('.batch-row').nth(1).click();await expect(page.getByRole('heading',{name:'エチオピア｜イルガチェフィー',exact:true})).toBeVisible();await expect(page.locator('.detail-age')).toHaveText('2.1ヶ月（65日）');
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'プリセットを管理'}).click();
 await expect(page.locator('.preset-actions:visible')).toHaveCount(0);await expect(page.locator('#preset-form')).toBeHidden();
 await page.getByRole('button',{name:'エチオピア｜イルガチェフィー',exact:true}).click();await page.getByRole('button',{name:'編集',exact:true}).click();
 await page.getByLabel('プリセット名').fill('エチオピア｜変更後');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'エチオピア｜変更後',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'在庫',exact:true}).click();await expect(page.locator('.bean-group').first()).toContainText('エチオピア｜変更後');await expect(page.locator('.bean-group').first().locator('.batch-row')).toHaveCount(2);
});
test('drag handle persists order, keyboard is an alternative, inventory follows after reload',async({page})=>{
 await seed(page);await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'プリセットを管理'}).click();
 const first=page.locator('.drag-handle').nth(0),second=page.locator('.drag-handle').nth(1);
 const a=await first.boundingBox(),b=await second.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height*.85,{steps:10});await page.mouse.up();
 await expect(page.locator('#reorder-status')).toHaveText('並び順を保存しました。');await expect(page.locator('.preset-name').first()).toHaveText('ケニア｜マサイ');
 await page.locator('.drag-handle').first().press('ArrowDown');await expect(page.locator('.preset-name').first()).toHaveText('エチオピア｜イルガチェフィー');await expect(page.locator('.preset-list')).toHaveAttribute('aria-busy','false');
 await page.locator('.drag-handle').nth(1).press('ArrowUp');await expect(page.locator('.preset-name').first()).toHaveText('ケニア｜マサイ');await expect(page.locator('.preset-list')).toHaveAttribute('aria-busy','false');
 await page.screenshot({path:'test-results/presets-compact.png',fullPage:true});
 await page.getByRole('link',{name:'在庫',exact:true}).click();await expect(page.locator('.bean-group').first()).toContainText('ケニア｜マサイ');await page.reload();await expect(page.locator('.bean-group').first()).toContainText('ケニア｜マサイ');
 await page.setViewportSize({width:320,height:720});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test.describe('touch interaction',()=>{
 test.use({hasTouch:true});
 test('touch handle reorder and failed save rollback',async({page,context})=>{
  await seed(page);await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'プリセットを管理'}).click();
  const a=await page.locator('.drag-handle').first().boundingBox(),b=await page.locator('.drag-handle').nth(1).boundingBox();
  const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height*.85}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#reorder-status')).toHaveText('並び順を保存しました。');await expect(page.locator('.preset-name').first()).toHaveText('ケニア｜マサイ');
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(mode==='readwrite')throw new DOMException('保存エラー','QuotaExceededError');return original.call(this,stores,mode,...rest);};});
  await page.locator('.drag-handle').first().press('ArrowDown');await expect(page.locator('#reorder-status')).toHaveText('保存エラー');await expect(page.locator('.preset-name').first()).toHaveText('ケニア｜マサイ');
 });
});
