import { mkdir, readFile } from 'node:fs/promises';
import { test as setup, expect } from '@playwright/test';

setup('authenticate primary E2E user', async ({ page }) => {
    await mkdir('tests/e2e/.auth', { recursive: true });
    const credentials =
        process.env.PLAYWRIGHT_EXTERNAL_SERVER === 'true'
            ? (JSON.parse(
                  await readFile(
                      'tests/e2e/.auth/lighting-credentials.json',
                      'utf8',
                  ),
              ) as { email: string; password: string })
            : { email: 'e2e@example.test', password: 'password' };
    await page.goto('/login');
    await page.getByLabel('Email address').fill(credentials.email);
    await page
        .getByLabel('Password', { exact: true })
        .fill(credentials.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/shows$/);
    await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });
});
