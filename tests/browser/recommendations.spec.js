import {test,expect} from '@playwright/test';

test('recommendations tab configures reserve targets, starts observation, and persists suggestions',async({page})=>{
 await page.clock.install({time:new Date('2026-09-29T12:00:00+09:00')});await page.goto('/');
 await expect(page.locator('#nav a')).toHaveText(['在庫','アーカイブ','おすすめ','設定']);
 await page.getByRole('link',{name:'おすすめ',exact:true}).click();
 await expect(page.getByRole('heading',{name:'おすすめ'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'新しい組み合わせ'})).toBeVisible();
 await expect(page.locator('.discovery-card')).toHaveCount(2);
 await expect(page.locator('#inventory-count')).toBeHidden();await expect(page.locator('.add-bar')).toHaveCount(0);
 const first=await page.locator('.discovery-card').allTextContents();
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'おすすめの設定',exact:true}).click();
 await expect(page.locator('#nav a[aria-current=page]')).toHaveText('設定');
 const preset=page.locator('.recommendation-preset').first();await preset.locator('summary').click();
 await preset.locator('input[type=number]').fill('1');
 await page.getByRole('button',{name:'今日から記録を始める'}).click();
 await page.getByRole('button',{name:'おすすめ設定を保存'}).click();
 await expect(page.locator('.tracking-status')).toContainText('2026/09/29');
 await expect(page.locator('#recommendation-settings-form')).toBeVisible();
 await page.getByRole('link',{name:'おすすめに戻る'}).click();
 await expect(page.locator('.recommendation-card').first()).toContainText('あと1袋');
 await expect(page.locator('.recommendation-card').first()).toContainText('未開封0袋／目標1袋');
 await page.getByRole('link',{name:'アーカイブ',exact:true}).click();await expect(page.getByRole('heading',{name:'アーカイブ'})).toBeVisible();
 await page.getByRole('link',{name:'おすすめ',exact:true}).click();await expect(page.getByRole('heading',{name:'おすすめ'})).toBeVisible();
 await expect(page.locator('.discovery-card')).toHaveCount(2);expect(await page.locator('.discovery-card').allTextContents()).toEqual(first);
 await page.reload();await expect(page.locator('.recommendation-card').first()).toContainText('あと1袋');
 for(const width of [320,390,440]){await page.setViewportSize({width,height:760});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===320)await page.screenshot({path:'test-results/recommendations-mobile.png',fullPage:true});}
});

test('purchase date can be recorded and is visible only in bean details',async({page})=>{
 await page.clock.install({time:new Date('2026-09-29T12:00:00+09:00')});await page.goto('/');
 await page.getByRole('link',{name:'豆を追加'}).click();
 await page.getByLabel('豆名', {exact:true}).fill('購入日確認用');
 await page.getByRole('radio',{name:'2'}).check();
 await page.getByLabel('焙煎日').fill('2026-09-20');
 await page.getByLabel('購入日（任意）').fill('2026-09-21');
 await page.getByRole('button',{name:'登録'}).click();
 await page.locator('.bean-group').filter({hasText:'購入日確認用'}).locator('.batch-row').click();
 await expect(page.getByRole('heading',{name:'購入日確認用'})).toBeVisible();
 await expect(page.locator('.detail-grid')).toContainText('購入日');await expect(page.locator('.detail-grid')).toContainText('2026/09/21');
 await page.getByRole('link',{name:'在庫に戻る'}).click();await expect(page.locator('.bean-list #purchaseDate')).toHaveCount(0);await expect(page.locator('.bean-list')).not.toContainText('購入日（任意）');
 await page.setViewportSize({width:320,height:720});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('recommendations and their settings remain available offline',async({page,context})=>{
 await page.clock.install({time:new Date('2026-09-29T12:00:00+09:00')});await page.goto('/');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);await page.reload();
 await page.getByRole('link',{name:'おすすめ',exact:true}).click();await expect(page.getByRole('heading',{name:'おすすめ'})).toBeVisible();
 await page.getByRole('link',{name:'設定',exact:true}).click();await page.getByRole('link',{name:'おすすめの設定',exact:true}).click();
 await page.getByLabel('何日分以下になったら購入候補にするか').fill('21');
 await page.getByRole('button',{name:'おすすめ設定を保存'}).click();await expect(page.locator('#notice')).toContainText('おすすめ設定を保存しました');
 await expect(page.locator('#lead-days')).toHaveValue('21');
});
