import { expect, test as base } from '@playwright/test';

type Fixtures = {
    clientErrorMonitor: void;
};

export const test = base.extend<Fixtures>({
    clientErrorMonitor: [
        async ({ page }, use) => {
            const errors: string[] = [];

            page.on('pageerror', (error) =>
                errors.push(`pageerror: ${error.message}`),
            );
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    if (
                        message
                            .text()
                            .startsWith(
                                'Failed to send logs: TypeError: Failed to fetch',
                            )
                    ) {
                        return;
                    }

                    errors.push(`console: ${message.text()}`);
                }
            });
            page.on('response', (response) => {
                if (response.status() >= 500) {
                    errors.push(`HTTP ${response.status()}: ${response.url()}`);
                }
            });

            await use();

            expect(errors, 'unexpected browser or server errors').toEqual([]);
        },
        { auto: true },
    ],
});

export { expect } from '@playwright/test';
