import { expect, test } from '../fixtures/test';
import { loggedOutStorage } from '../helpers/auth';

test.use({ storageState: loggedOutStorage });

test('a verified user can log in with case-insensitive email matching', async ({
    page,
}) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('E2E@EXAMPLE.TEST');
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByLabel('Remember me').click();
    await expect(page.getByLabel('Remember me')).toHaveAttribute(
        'aria-checked',
        'true',
    );
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/shows$/);
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible();
});

test('invalid credentials show the implemented validation error', async ({
    page,
}) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('e2e@example.test');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(
        page.getByText('These credentials do not match our records.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
});

test('required login fields use native form validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByLabel('Email address')).toBeFocused();
    await expect(page).toHaveURL(/\/login$/);
});
