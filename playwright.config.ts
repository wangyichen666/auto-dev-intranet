import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
const python = resolve(process.env.INTRANET_PYTHON || '.venv312/bin/python');
const quotedPython = "'" + python.replaceAll("'", "'\\''") + "'";
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:15173', ...devices['Desktop Chrome'], channel: 'chrome', trace: 'retain-on-failure' },
  projects: [{ name: '桌面', use: { viewport: { width: 1440, height: 900 } } }, { name: '中屏', use: { viewport: { width: 1024, height: 768 } } }, { name: '移动', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: [
    { command: `cd server && ${quotedPython} -m uvicorn tests.e2e_app:app --host 127.0.0.1 --port 18000 --no-access-log`, url: 'http://127.0.0.1:18000/api/v1/health', reuseExistingServer: false },
    { command: 'npm run dev -- --port 15173 --strictPort', url: 'http://127.0.0.1:15173', env: { INTRANET_API_TARGET: 'http://127.0.0.1:18000' }, reuseExistingServer: false },
  ],
});
