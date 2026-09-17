import { test, expect } from '@playwright/test';
test('PWA manifest and icons resolve from a subpath deployment',async({page,request})=>{
  await page.goto('/_site/');
  await expect(page.getByRole('heading',{name:'現在の貯蔵数'})).toBeVisible();
  const manifestURL=await page.locator('link[rel=manifest]').evaluate(el=>el.href);
  const manifest=await (await request.get(manifestURL)).json();
  expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('./');
  for(const icon of manifest.icons){const response=await request.get(new URL(icon.src,manifestURL).href);expect(response.ok()).toBe(true);expect((await response.body()).subarray(1,4).toString()).toBe('PNG');}
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
});
