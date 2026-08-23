import { expect, test } from '../fixtures/test';

test('desktop navigation reaches every primary destination', async ({
    page,
}) => {
    await page.goto('/shows');

    for (const [name, path] of [
        ['Movies', '/movies'],
        ['Search', '/search'],
        ['Profile', '/profile'],
        ['Shows', '/shows'],
    ] as const) {
        await page
            .getByRole('navigation')
            .getByRole('link', { name, exact: true })
            .click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
});

test('browser back and forward preserve Inertia navigation state', async ({
    page,
}) => {
    await page.goto('/shows');
    await page.goto('/search');
    await page.goto('/movies');
    await page.goBack();
    await expect(page).toHaveURL(/\/search$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/movies$/);
});

test('media sub-tabs navigate between watch list and upcoming', async ({
    page,
}) => {
    await page.goto('/shows');
    await page.getByRole('link', { name: 'Upcoming', exact: true }).click();
    await expect(page).toHaveURL(/\/shows\/upcoming$/);
    await page.getByRole('link', { name: 'Watch List', exact: true }).click();
    await expect(page).toHaveURL(/\/shows$/);
});
