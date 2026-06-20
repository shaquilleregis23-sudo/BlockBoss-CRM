import {defineConfig,devices} from '@playwright/test';
const remote=process.env.E2E_BASE_URL;
export default defineConfig({
  testDir:'./tests/e2e',timeout:30000,fullyParallel:false,retries:1,reporter:'line',
  use:{baseURL:remote||'http://127.0.0.1:4173',serviceWorkers:'block',trace:'retain-on-failure'},
  webServer:remote?undefined:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:true,timeout:15000},
  projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}},{name:'iphone-13',use:{...devices['iPhone 13']}}]
});
