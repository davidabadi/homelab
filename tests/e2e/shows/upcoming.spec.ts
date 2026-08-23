import { expect, test } from '../fixtures/test';

test('upcoming shows separate backlog from future episodes', async ({
    page,
}) => {
    await page.goto('/shows/upcoming');
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible();
    await expect(page.getByText('Tomorrow Signal')).toBeVisible();
    await expect(page.getByText('Second Orbit')).toBeVisible();
});

test('upcoming episode opens its quick view and show detail', async ({
    page,
}) => {
    await page.goto('/shows/upcoming');
    await page.getByText('Tomorrow Signal').click();
    await expect(page.getByRole('dialog')).toContainText('Tomorrow Signal');
    await page.getByRole('button', { name: 'Close' }).click();
    await page
        .getByRole('button', { name: 'Orbital Detectives' })
        .first()
        .click();
    await expect(
        page.getByRole('dialog', { name: 'Orbital Detectives' }),
    ).toBeVisible();
});
