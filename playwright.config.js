import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL:'http://127.0.0.1:4174', viewport:{width:390,height:844}, browserName:'chromium', channel:'chrome' },
  webServer: { command:'node scripts/prepare-pages.mjs && python3 -m http.server 4174 --bind 127.0.0.1', url:'http://127.0.0.1:4174', reuseExistingServer:false },
  reporter:'list'
});
