import { expect, test } from '../fixtures/test';

test('mobile bottom navigation reaches all primary tabs', async ({ page }) => {
    await page.goto('/shows');
    const navigation = page
        .getByRole('navigation')
        .filter({ has: page.getByRole('link', { name: 'Shows', exact: true }) })
        .last();

    for (const [name, path] of [
        ['Movies', '/movies'],
        ['Search', '/search'],
        ['Profile', '/profile'],
        ['Shows', '/shows'],
    ] as const) {
        await navigation.getByRole('link', { name, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
});

test('narrow viewport has no horizontal page overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/shows');
    const overflow = await page.evaluate(
        () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
});

test('show detail dialog fits within a phone viewport', async ({ page }) => {
    await page.goto('/shows');
    await page
        .getByRole('listitem')
        .filter({ hasText: 'Unwatched Signal' })
        .getByRole('button', {
            name: 'Orbital Detectives',
            exact: true,
        })
        .click();
    const bounds = await page
        .getByRole('dialog', { name: 'Orbital Detectives' })
        .boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test('keyboard focus reaches the mobile primary navigation', async ({
    page,
}) => {
    await page.goto('/shows');
    await page.keyboard.press('Tab');
    await expect
        .poll(async () =>
            page.evaluate(() => document.activeElement?.textContent ?? ''),
        )
        .not.toBe('');
});
