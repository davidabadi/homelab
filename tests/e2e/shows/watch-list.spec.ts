import { expect, test } from '../fixtures/test';

test('show watch list renders sections, progress, fallbacks, and long titles', async ({
    page,
}) => {
    await page.goto('/shows');
    await expect(page.getByRole('heading', { name: 'Shows' })).toBeVisible();
    await expect(
        page
            .getByRole('button', {
                name: 'Orbital Detectives',
                exact: true,
            })
            .first(),
    ).toBeVisible();
    await expect(page.getByText('Watch Next')).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'See Watch Later Shows' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'See Watch Later Shows' }).click();
    await expect(
        page.getByText(
            'A Remarkably Long Show Title That Wraps Across Two Lines',
        ),
    ).toBeVisible();
});

test('history request is deferred from the initial document payload', async ({
    page,
}) => {
    const historyRequests: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes('/shows/watched-history')) {
            historyRequests.push(request.url());
        }
    });
    const response = await page.goto('/shows');
    expect((await response?.text()) ?? '').not.toContain('Watched History');
    await expect.poll(() => historyRequests.length).toBeGreaterThanOrEqual(1);
});

test('show detail dialog opens, exposes metadata and returns focus on Escape', async ({
    page,
}) => {
    await page.goto('/shows');
    const opener = page
        .getByRole('listitem')
        .filter({ hasText: 'Unwatched Signal' })
        .getByRole('button', {
            name: 'Orbital Detectives',
            exact: true,
        });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Orbital Detectives' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'about' }).click();
    await expect(
        dialog.getByText('Overview for Orbital Detectives.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'episodes' }).click();
    await expect(dialog.getByText('Season 1')).toBeVisible();
    const focusableElements = dialog.locator(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    await focusableElements.last().focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
});

test('episode quick view opens from a watch-next row', async ({ page }) => {
    await page.goto('/shows');
    await page.getByText('S01 | E03').click();
    await expect(page.getByRole('dialog')).toContainText('Unwatched Signal');
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
});
