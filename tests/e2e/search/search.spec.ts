import { expect, test } from '../fixtures/test';

test('search debounces a query and renders deterministic show and movie results', async ({
    page,
}) => {
    await page.goto('/search');
    const input = page.getByPlaceholder('Search shows and movies');
    await input.fill('deterministic');
    await expect(page).toHaveURL(/q=deterministic/);
    await expect(page.getByText('E2E Search Show')).toBeVisible();
    await expect(page.getByText('E2E Search Movie')).toBeVisible();
});

test('search result detail can be opened without a real TMDB request', async ({
    page,
}) => {
    const tmdbRequests: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes('themoviedb.org')) {
            tmdbRequests.push(request.url());
        }
    });
    await page.goto('/search?q=deterministic');
    await page.getByRole('button', { name: /E2E Search Show TV Show/ }).click();
    await expect(
        page.getByRole('dialog', { name: 'E2E Search Show' }),
    ).toBeVisible();
    expect(tmdbRequests).toEqual([]);
});

test('tracking a search result updates its accessible action without a full reload', async ({
    page,
}) => {
    await page.goto('/search?q=deterministic');
    const track = page.getByRole('button', { name: 'Track E2E Search Movie' });
    await track.click();
    await expect(
        page.getByRole('button', { name: 'Untrack E2E Search Movie' }),
    ).toBeVisible();
});
