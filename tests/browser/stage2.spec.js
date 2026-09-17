import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function seed(page){
 await page.goto('/');await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
 await page.evaluate(async()=>{
  const {createRepository}=await import('/db.js');const {today}=await import('/dates.js');const repo=createRepository();
  for(const days of [179,180,364,365,547,548]){const date=new Date();date.setDate(date.getDate()-days);await repo.add({name:`豆${days}`,roastType:'scale',roastValue:2,roastCustom:null,roastDate:today(date)});}await repo.close();
 });await page.reload();await page.getByRole('button',{name:'古い順',exact:true}).click();
}
test('filter thresholds and preset CRUD leave stored bean names independent',async({page})=>{
 await seed(page);
 for(const [label,count] of [['半年〜',5],['1年〜',3],['1年半〜',1],['すべて',6]]){
  await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('.bean-card')).toHaveCount(count);
 }
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'プリセットを管理'}).click();
 await page.getByRole('button',{name:'＋ プリセットを追加',exact:true}).click();
 await page.getByLabel('プリセット名').fill('新しいプリセット');await page.getByRole('button',{name:'追加',exact:true}).click();
 const row=page.locator('.preset-list section').filter({has:page.getByRole('button',{name:'新しいプリセット',exact:true})});
 await expect(row).toBeVisible();await row.getByRole('button',{name:'新しいプリセット',exact:true}).click();await row.getByRole('button',{name:'編集'}).click();await page.getByLabel('プリセット名').fill('変更後');await page.getByRole('button',{name:'保存',exact:true}).click();
 const changed=page.locator('.preset-list section').filter({has:page.getByRole('button',{name:'変更後',exact:true})});
 await changed.getByRole('button',{name:'変更後',exact:true}).click();await changed.getByRole('button',{name:'削除'}).click();await page.getByRole('dialog').getByRole('button',{name:'完全に削除'}).click();await expect(changed).toHaveCount(0);
});
test('JSON download, confirmation, full restore and invalid file rejection',async({page})=>{
 await seed(page);await page.getByRole('link',{name:'設定',exact:true}).click();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'JSONを書き出す'}).click();const download=await downloading;
 const bytes=await readFile(await download.path());const data=JSON.parse(bytes.toString());expect(data.beans).toHaveLength(6);expect(data.presets).toHaveLength(9);
 await page.locator('#import-json').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});
 await expect(page.getByRole('heading',{name:'バックアップを復元'})).toBeVisible();await page.getByRole('link',{name:'キャンセル',exact:true}).click();
 await expect(page.getByRole('heading',{name:'設定',exact:true})).toBeVisible();
 await page.locator('#import-json').setInputFiles({name:'empty.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...data,beans:[],presets:[]}))});
 await expect(page.getByText('空のバックアップです。復元すると全データがなくなります。')).toBeVisible();
 await page.getByRole('button',{name:'全データを置き換えて復元'}).click();await expect(page.getByRole('heading',{name:'設定',exact:true})).toBeVisible();
 await page.locator('#import-json').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:bytes});await page.getByRole('button',{name:'全データを置き換えて復元'}).click();await expect(page.getByRole('heading',{name:'設定',exact:true})).toBeVisible();
 await page.locator('#import-json').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(page.getByRole('alert')).toContainText('JSONファイルを読み込めませんでした');
 await page.getByRole('link',{name:'在庫',exact:true}).click();await expect(page.locator('.bean-card')).toHaveCount(6);
 await page.getByRole('button',{name:'1年〜',exact:true}).click();await expect(page.locator('.bean-card')).toHaveCount(3);
 await page.screenshot({path:'test-results/stage2-mobile.png',fullPage:true});
});
