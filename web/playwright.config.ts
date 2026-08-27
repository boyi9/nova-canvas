import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:4173',
        headless: true,
    },
    webServer: {
        command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: false,
        timeout: 120000,
    },
});
