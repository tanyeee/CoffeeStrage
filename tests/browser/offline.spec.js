import { readFile, writeFile, utimes } from 'node:fs/promises';
import {test,expect} from '@playwright/test';
async function ready(page){
 await page.goto('/_site/');await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
}
test('offline reload, CRUD, presets, backup and CSV work from the deployed subpath',async({page,context})=>{
 await ready(page);await context.setOffline(true);await page.reload();
 await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
 await page.getByRole('link',{name:'豆を追加'}).click();await page.getByLabel('プリセットから選ぶ').selectOption({label:'エチオピア｜イルガチェフィー G1 ブナブナ'});
 await page.getByRole('radio',{name:'2',exact:true}).check();await page.getByLabel('焙煎日',{exact:true}).fill('2025-01-01');await page.getByRole('button',{name:'登録',exact:true}).click();
 await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();await page.reload();await page.getByLabel('並び順').selectOption('oldest');await expect(page.locator('.bean-card')).toHaveCount(1);await page.locator('.bean-card').click();
 await page.getByRole('link',{name:'編集',exact:true}).click();await page.getByLabel('豆名',{exact:true}).fill('オフライン豆');await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('button',{name:'飲み終わり',exact:true}).click();await expect(page.getByText('飲み終わり日時',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'設定',exact:true}).click();await expect(page.locator('[data-pwa-status]')).toContainText('準備ができました');
 for(const name of ['JSONを書き出す','CSVを書き出す']){const wait=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();expect((await wait).suggestedFilename()).toMatch(/\.(json|csv)$/);}
 await page.getByRole('link',{name:'プリセットを管理'}).click();await page.getByRole('button',{name:'＋ プリセットを追加',exact:true}).click();await page.getByLabel('プリセット名').fill('オフラインプリセット');await page.getByRole('button',{name:'追加',exact:true}).click();await expect(page.getByRole('button',{name:'オフラインプリセット',exact:true})).toBeVisible();
});
test('new release waits without replacing an unsaved form, activates after closing, preserves DB',async({page,context})=>{
 await ready(page);
 await page.evaluate(async()=>{const {createRepository}=await import('/_site/db.js');const repo=createRepository();await repo.add({name:'更新前',roastDate:'2025-01-01',roastType:'scale',roastValue:2,roastCustom:null});await repo.close();});
 await page.goto('/_site/#/beans/new');await page.getByLabel('豆名',{exact:true}).fill('入力途中');
 const workerPath='_site/service-worker.js';
 const original=await readFile(workerPath,'utf8');
 try {
 await writeFile(workerPath,original.replace(/const VERSION = [^;]+;/,"const VERSION = 'test-next-release';"));
 await utimes(workerPath,new Date(),new Date(Date.now()+2000));
 await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
 await expect.poll(()=>page.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(true);
 await expect(page.getByLabel('豆名',{exact:true})).toHaveValue('入力途中');
 await page.close();const next=await context.newPage();await next.goto('/_site/');await next.evaluate(()=>navigator.serviceWorker.ready);
 await expect(next.locator('.bean-group')).toContainText('更新前');
 await expect.poll(()=>next.evaluate(async()=> (await caches.keys()).some(key=>key.endsWith('test-next-release')))).toBe(true);
 } finally {await writeFile(workerPath,original);}
});
test('failed app-shell update retains the working offline release',async({page,context})=>{
 await ready(page);
 const path='_site/service-worker.js',original=await readFile(path,'utf8');
 try{
  await writeFile(path,original.replace(/const VERSION = [^;]+;/,"const VERSION = 'test-bad-release';").replace("const FILES = [","const FILES = ['missing-file.html',"));
  await utimes(path,new Date(),new Date(Date.now()+2000));
  const state=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.getRegistration();
   const finished=new Promise(resolve=>registration.addEventListener('updatefound',()=>{
    const worker=registration.installing;worker.addEventListener('statechange',()=>{if(['redundant','installed'].includes(worker.state))resolve(worker.state);});
   },{once:true}));
   await registration.update();return finished;
  });
  expect(state).toBe('redundant');
  expect(await page.evaluate(async()=> (await caches.keys()).some(key=>key.endsWith('test-bad-release')))).toBe(false);
  await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
 }finally{await writeFile(path,original);}
});
