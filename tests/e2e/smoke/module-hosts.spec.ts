import { expect, test } from '@playwright/test';

const modules = [
    {
        name: 'Schedule Board',
        module: 'schedule',
        url: 'http://schedule.localhost:8000',
        icon: '/icons/schedule.svg',
    },
    {
        name: 'US Presence',
        module: 'presence',
        url: 'http://presence.localhost:8000',
        icon: '/icons/presence.svg',
    },
];

for (const module of modules) {
    test(`${module.name} stays independent from the TV PWA`, async ({
        context,
        page,
    }) => {
        const cookies = await context.cookies();

        await context.addCookies(
            cookies.map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                url: module.url,
            })),
        );

        await page.goto(module.url);
        await expect(page).toHaveTitle(new RegExp(module.name));
        await expect(page.locator('html')).toHaveAttribute(
            'data-app-module',
            module.module,
        );
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
            'href',
            module.icon,
        );
        await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
        await expect(page.getByText('TV Time', { exact: true })).toHaveCount(0);

        const serviceWorkerState = await page.evaluate(async () => ({
            controlled: navigator.serviceWorker.controller !== null,
            registrations: (await navigator.serviceWorker.getRegistrations())
                .length,
        }));

        expect(serviceWorkerState).toEqual({
            controlled: false,
            registrations: 0,
        });

        await page.reload();
        await expect(page).toHaveTitle(new RegExp(module.name));
    });
}
