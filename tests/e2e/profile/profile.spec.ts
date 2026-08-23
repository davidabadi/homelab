import { expect, test } from '../fixtures/test';
import { login } from '../helpers/auth';

test('profile shows deterministic identity, statistics, and recent media', async ({
    page,
}) => {
    await page.goto('/profile');
    await expect(
        page.getByRole('heading', { name: 'E2E Primary User' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible();
    await expect(page.getByText('Episodes watched')).toBeVisible();
    await expect(page.getByText('Movies watched')).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Open Orbital Detectives details' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Open Chronicle One details' }),
    ).toBeVisible();
});

test('profile show and movie libraries open as accessible dialogs', async ({
    page,
}) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Open all shows' }).click();
    await expect(page.getByRole('dialog', { name: 'Shows' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Shows library' }).click();
    await page.getByRole('button', { name: 'Open all movies' }).click();
    await expect(page.getByRole('dialog', { name: 'Movies' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Movies library' }).click();
});

test('profile opens a watched movie collection detail', async ({ page }) => {
    await page.goto('/profile');
    await page
        .getByRole('button', { name: 'Open Chronicle One details' })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Chronicle One' });
    await expect(dialog.getByText('E2E Collection')).toBeVisible();
    await expect(
        dialog.getByText('E2E Search Movie: The Much Longer Sequel Title'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
});

test('another user cannot see the primary user library', async ({
    browser,
}) => {
    const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:8000',
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await login(page, 'secondary@example.test');
    await page.goto('/profile');
    await expect(
        page.getByRole('button', {
            name: 'Open Secondary User Secret Show details',
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Open Orbital Detectives details' }),
    ).toBeHidden();
    await context.close();
});
