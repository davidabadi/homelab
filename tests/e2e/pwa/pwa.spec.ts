import { expect, test } from '../fixtures/test';

test('PWA manifest and service worker are served from root scope', async ({
    request,
}) => {
    const manifest = await request.get('/manifest.webmanifest');
    const worker = await request.get('/sw.js');
    expect(manifest.ok()).toBeTruthy();
    expect(manifest.headers()['content-type']).toContain(
        'application/manifest+json',
    );
    expect(worker.ok()).toBeTruthy();
    expect(worker.headers()['content-type']).toContain(
        'application/javascript',
    );
});

test('manifest contains installable application metadata', async ({
    request,
}) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({
        name: 'TV Time',
        short_name: 'TV Time',
        id: '/',
        scope: '/',
        start_url: '/',
        display: 'standalone',
    });
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
            expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
            expect.objectContaining({ purpose: 'maskable' }),
        ]),
    );
});

test('TV registers an explicitly updating root-scoped service worker', async ({
    page,
}) => {
    await page.goto('/shows');

    const registration = await page.evaluate(async () => {
        const worker = await navigator.serviceWorker.ready;

        return {
            scope: worker.scope,
            scriptURL: worker.active?.scriptURL,
            updateViaCache: worker.updateViaCache,
        };
    });

    expect(registration.scope).toBe(new URL('/', page.url()).href);
    expect(registration.scriptURL).toBe(new URL('/sw.js', page.url()).href);
    expect(registration.updateViaCache).toBe('none');
});
