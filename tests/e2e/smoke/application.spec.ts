import { expect, test } from '../fixtures/test';
import { loggedOutStorage } from '../helpers/auth';

test('health endpoint reports the isolated database is reachable', async ({
    request,
}) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
        status: 'ok',
        database: 'ok',
    });
});

test.describe('logged out routing', () => {
    test.use({ storageState: loggedOutStorage });

    test('root and protected pages redirect to login', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveURL(/\/login$/);
        await page.goto('/profile');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('login page and critical assets load', async ({ page, request }) => {
        await page.goto('/login');
        await expect(
            page.getByRole('heading', { name: 'Log in to your account' }),
        ).toBeVisible();
        expect((await request.get('/favicon.svg')).ok()).toBeTruthy();
    });
});

test('authenticated Inertia pages support direct refreshes', async ({
    page,
}) => {
    for (const path of ['/shows', '/movies', '/search', '/profile']) {
        await page.goto(path);
        await page.reload();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
});

test('unknown routes render a 404 response without a server error', async ({
    request,
}) => {
    const response = await request.get('/definitely-not-a-route');
    expect(response.status()).toBe(404);
});
