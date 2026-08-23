import { mkdir } from 'node:fs/promises';
import { test as setup, expect } from '@playwright/test';

setup('authenticate primary E2E user', async ({ page }) => {
    await mkdir('tests/e2e/.auth', { recursive: true });
    await page.goto('/login');
    await page.getByLabel('Email address').fill('e2e@example.test');
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/shows$/);
    await page.context().storageState({ path: 'tests/e2e/.auth/user.json' });
});
