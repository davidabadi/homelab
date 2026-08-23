import { expect, test } from '../fixtures/test';

test('movie watch list shows released unwatched titles and excludes future releases', async ({
    page,
}) => {
    await page.goto('/movies');
    await expect(page.getByText('Watch Next', { exact: true })).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Quiet Standalone' }),
    ).toBeVisible();
    await expect(page.getByText('Tomorrow at the Cinema')).toBeHidden();
});

test('movie detail shows tracking state and metadata', async ({ page }) => {
    await page.goto('/movies');
    await page.getByRole('button', { name: 'Quiet Standalone' }).click();
    const dialog = page.getByRole('dialog', { name: 'Quiet Standalone' });
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByText('Overview for Quiet Standalone.'),
    ).toBeVisible();
    await expect(dialog.getByText('On your watchlist')).toBeVisible();
});

test('movie upcoming feed excludes past releases', async ({ page }) => {
    await page.goto('/movies/upcoming');
    await expect(page.getByText('Tomorrow at the Cinema')).toBeVisible();
    await expect(
        page.getByText('Chronicle Two and the Extremely Long Subtitle'),
    ).toBeVisible();
    await expect(page.getByText('Chronicle One')).toBeHidden();
});
