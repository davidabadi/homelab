import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';

test('logout invalidates the session and protected history cannot be revisited', async ({
    browser,
}) => {
    const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:8000',
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await login(page, 'security@example.test');
    await page.goto('/shows');
    await page.getByText('E2E security User').click();
    await page.getByRole('menuitem', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await context.close();
});
