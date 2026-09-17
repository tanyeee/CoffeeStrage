import { test, expect } from '@playwright/test';
test('PWA manifest and icons resolve from a subpath deployment',async({page,request})=>{
  await page.goto('/_site/');
  await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
  const manifestURL=await page.locator('link[rel=manifest]').evaluate(el=>el.href);
  const manifest=await (await request.get(manifestURL)).json();
  expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('./');
  for(const icon of manifest.icons){const response=await request.get(new URL(icon.src,manifestURL).href);expect(response.ok()).toBe(true);expect((await response.body()).subarray(1,4).toString()).toBe('PNG');}
  expect(await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
