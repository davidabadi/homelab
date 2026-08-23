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
    expect(manifest).toMatchObject({ start_url: '/', display: 'standalone' });
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
});
