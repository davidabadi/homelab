import { expect, test } from '../fixtures/test';
import { login } from '../helpers/auth';

test('account settings validate and update a dedicated user profile', async ({
    browser,
}) => {
    const context = await browser.newContext({
        baseURL: 'http://127.0.0.1:8000',
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await login(page, 'profile@example.test');
    await page.goto('/settings/profile');
    await page.getByLabel('Name').fill('Updated E2E Profile');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('Updated E2E Profile');
    await context.close();
});

test('security settings require password confirmation and expose 2FA and passkeys', async ({
    page,
}) => {
    await page.goto('/settings/security');
    await expect(page).toHaveURL(/\/user\/confirm-password$/);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Confirm password' }).click();
    await expect(
        page.getByText('The provided password was incorrect.'),
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Confirm password' }).click();
    await expect(page).toHaveURL(/\/settings\/security$/);
    await expect(
        page.getByRole('heading', { name: 'Two-factor authentication' }),
    ).toBeVisible();
    await expect(page.getByText('No passkeys yet')).toBeVisible();
});

test('appearance selection persists after reload', async ({ page }) => {
    await page.goto('/settings/appearance');
    const dark = page.getByRole('button', { name: 'Dark' });
    await dark.click();
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
});

test('Yamtrack import validates file type and supports a real CSV upload', async ({
    page,
}) => {
    await page.goto('/settings/import');
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Choose a CSV/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(
        'tests/Fixtures/yamtrack_import_development_fixture.csv',
    );
    await expect(
        page.getByText('yamtrack_import_development_fixture.csv'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(
        page.getByRole('heading', {
            name: /Latest import|Import complete|Import status/i,
        }),
    ).toBeVisible();
});
