import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir: './tests/ui', fullyParallel: false, workers: 1, timeout: 60000,
 use: { actionTimeout: 10000, baseURL: process.env.TEST_APP_URL || 'http://localhost:3000', viewport: { width: 1440, height: 1050 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
 webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 60000 },
 reporter: [['list']], outputDir: 'test-results'
})
