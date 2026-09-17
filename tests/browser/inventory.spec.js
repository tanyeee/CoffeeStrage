import { test, expect } from '@playwright/test';

async function add(page,name,date,custom=false) {
  await page.getByRole('link',{name:'豆を追加'}).click();
  await page.getByLabel('豆名',{exact:true}).fill(name);
  await page.getByRole('radio',{name:custom?'その他':'2',exact:true}).check();
  if(custom) await page.getByLabel('焙煎度の名前').fill('中深煎り');
  await page.getByLabel('焙煎日',{exact:true}).fill(date);
  await page.getByRole('button',{name:'登録',exact:true}).click();
  await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
}
test('phone-sized inventory lifecycle, persistence, cancellation, and safe rendering',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'最初のひと袋を、セラーへ。'})).toBeVisible();
  await add(page,'新しい豆','2025-12-01');
  await add(page,'<img src=x onerror=alert(1)> Guji','2025-05-12',true);
  await expect(page.locator('.bean-card').first()).toContainText('<img src=x onerror=alert(1)> Guji');
  await expect(page.locator('.bean-card img')).toHaveCount(0);
  await page.reload();await expect(page.locator('.bean-card')).toHaveCount(2);
  await page.locator('.bean-card').first().click();
  await page.getByRole('link',{name:'編集',exact:true}).click();
  await page.getByLabel('豆名',{exact:true}).fill('エチオピア Guji');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('heading',{name:'エチオピア Guji'})).toBeVisible();
  await page.getByRole('button',{name:'飲み終わり',exact:true}).click();
  await expect(page.getByRole('button',{name:'完全に削除'})).toBeVisible();
  await page.reload();await expect(page.getByText('飲み終わり日時',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'完全に削除'}).click();
  await expect(page.getByRole('button',{name:'キャンセル'})).toBeFocused();
  await page.getByRole('button',{name:'キャンセル'}).click();
  await expect(page.getByRole('heading',{name:'エチオピア Guji'})).toBeVisible();
  await page.getByRole('button',{name:'完全に削除'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'完全に削除'}).click();
  await expect(page.getByRole('heading',{name:'まだ履歴はありません'})).toBeVisible();
  await page.getByRole('link',{name:'在庫',exact:true}).click();
  await expect(page.locator('.bean-card')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/inventory-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});
test('validation and unsaved-change protection preserve the form',async({page})=>{
  await page.goto('/#/beans/new');
  await page.getByRole('button',{name:'登録',exact:true}).click();
  await expect(page.getByText('豆名を入力してください。',{exact:true})).toBeVisible();
  await expect(page.getByLabel('豆名',{exact:true})).toBeFocused();
  await page.getByLabel('豆名',{exact:true}).fill('保存前の豆');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('link',{name:'戻る'}).click();
  await expect(page.getByLabel('豆名',{exact:true})).toHaveValue('保存前の豆');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('link',{name:'戻る'}).click();
  await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
});
test('storage failure keeps entered data and never reports success',async({page})=>{
  await page.goto('/#/beans/new');
  await page.getByLabel('豆名',{exact:true}).fill('保存失敗テスト');
  await page.getByRole('radio',{name:'2',exact:true}).check();
  await page.evaluate(()=>{ IDBDatabase.prototype.transaction=function(){throw new DOMException('Test failure','QuotaExceededError');}; });
  await page.getByRole('button',{name:'登録',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('保存できませんでした');
  await expect(page.getByLabel('豆名',{exact:true})).toHaveValue('保存失敗テスト');
  await expect(page.getByRole('button',{name:'登録',exact:true})).toBeEnabled();
});

test('menu presets fill an editable name and the requested copy is shown',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
  await expect(page.locator('.subtitle')).toHaveText('ゆっくりと時を重ねる、あなたのコーヒー');
  await page.getByRole('link',{name:'豆を追加'}).click();
  await expect(page.locator('#preset option')).toHaveCount(10);
  await page.getByLabel('プリセットから選ぶ').selectOption({label:'ブラジル キャラメラード'});
  await expect(page.getByLabel('豆名',{exact:true})).toHaveValue('ブラジル キャラメラード');
  await page.getByLabel('豆名',{exact:true}).fill('ブラジル キャラメラード（別袋）');
  await page.getByRole('radio',{name:'3',exact:true}).check();
  await page.getByRole('button',{name:'登録',exact:true}).click();
  await expect(page.locator('.bean-card')).toContainText('ブラジル キャラメラード（別袋）');
  await page.locator('.bean-card').click();await page.getByRole('link',{name:'編集',exact:true}).click();
  await expect(page.getByLabel('豆名',{exact:true})).toHaveValue('ブラジル キャラメラード（別袋）');
  await page.getByLabel('プリセットから選ぶ').selectOption({label:'ケニア マサイ AA'});
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByRole('heading',{name:'ケニア マサイ AA'})).toBeVisible();
  await page.getByRole('link',{name:'アーカイブ',exact:true}).click();
  await expect(page.locator('.subtitle')).toHaveCount(0);
});
