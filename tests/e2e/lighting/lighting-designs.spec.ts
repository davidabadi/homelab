import { randomUUID } from 'node:crypto';
import { test as unmonitoredTest } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type {
    ComponentDefinition,
    LightingLayout,
} from '../../../resources/js/components/lighting/types';
import { expect, test } from '../fixtures/test';

const lightingUrl =
    process.env.PLAYWRIGHT_LIGHTING_URL ?? 'http://lighting.localhost:8000';

test.use({ viewport: { width: 1600, height: 1000 } });
unmonitoredTest.use({ viewport: { width: 1600, height: 1000 } });

async function openLighting(
    context: BrowserContext,
    page: Page,
    brokenImages = false,
): Promise<void> {
    await page.route('https://kb.shelly.cloud/**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: brokenImages
                ? Buffer.from('not an image')
                : Buffer.from(
                      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=',
                      'base64',
                  ),
        }),
    );
    const cookies = await context.cookies();
    await context.addCookies(
        cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            url: lightingUrl,
        })),
    );
    await page.goto(lightingUrl);
    await expect(
        page.getByRole('heading', { name: 'Panel designs', exact: true }),
    ).toBeVisible();
}

async function api<T>(
    page: Page,
    pathname: string,
    method = 'GET',
    body?: unknown,
): Promise<T> {
    const result = await page.evaluate(
        async ({
            pathname: endpoint,
            method: requestMethod,
            body: requestBody,
        }) => {
            const token = document.cookie
                .split('; ')
                .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
                ?.slice('XSRF-TOKEN='.length);
            const response = await fetch(endpoint, {
                method: requestMethod,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-XSRF-TOKEN': token ? decodeURIComponent(token) : '',
                },
                ...(requestBody === undefined
                    ? {}
                    : { body: JSON.stringify(requestBody) }),
            });
            const payload =
                response.status === 204 ? null : await response.json();

            if (!response.ok) {
                throw new Error(
                    `Lighting test API returned ${response.status}: ${JSON.stringify(payload)}`,
                );
            }

            return payload;
        },
        { pathname, method, body },
    );

    return result as T;
}

function readLayout(page: Page, designId: number): Promise<LightingLayout> {
    return api<LightingLayout>(page, `/api/designs/${designId}`);
}

async function cleanupDesigns(page: Page, prefix: string): Promise<void> {
    const response = await api<{ designs: { id: number; name: string }[] }>(
        page,
        '/api/designs',
    );

    for (const design of response.designs.filter((item) =>
        item.name.startsWith(prefix),
    )) {
        await api(page, `/api/designs/${design.id}`, 'DELETE');
    }
}

async function createDesign(page: Page, name: string): Promise<number> {
    await page
        .getByRole('button', { name: 'New design', exact: true })
        .first()
        .click();
    const dialog = page.getByRole('dialog', { name: 'New panel design' });
    await dialog.getByLabel('Design name', { exact: true }).fill(name);
    await dialog
        .getByRole('button', { name: 'Create design', exact: true })
        .click();
    await expect(page).toHaveURL(/\/designs\/\d+$/);
    await expect(page.getByTestId('lighting-canvas')).toBeVisible();
    const designId = Number(new URL(page.url()).pathname.split('/').at(-1));
    expect(designId).toBeGreaterThan(0);

    return designId;
}

function inspector(page: Page): Locator {
    return page.getByRole('complementary', { name: 'Properties inspector' });
}

function componentNode(page: Page, id: string): Locator {
    return page.getByTestId(`lighting-component-${id}`);
}

async function placeComponent(
    page: Page,
    designId: number,
    name: string,
): Promise<string> {
    const previous = await readLayout(page, designId);
    await page
        .getByRole('button', { name: `Place ${name}`, exact: true })
        .click();
    await expect
        .poll(async () => (await readLayout(page, designId)).components.length)
        .toBe(previous.components.length + 1);
    const saved = await readLayout(page, designId);
    const component = saved.components.find(
        (item) =>
            !previous.components.some(
                (old) => old.portable_id === item.portable_id,
            ),
    );
    expect(component).toBeDefined();
    await expect(componentNode(page, component!.portable_id)).toBeVisible();

    return component!.portable_id;
}

async function setPosition(page: Page, x: number, y: number): Promise<void> {
    await inspector(page).getByLabel('X (mm)', { exact: true }).fill(String(x));
    await inspector(page).getByLabel('X (mm)', { exact: true }).blur();
    await inspector(page).getByLabel('Y (mm)', { exact: true }).fill(String(y));
    await inspector(page).getByLabel('Y (mm)', { exact: true }).blur();
}

test('creates, places, reloads, and duplicates independent panel designs', async ({
    context,
    page,
}, testInfo) => {
    const name = `Lighting E2E ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const originalId = await placeComponent(
            page,
            designId,
            'Shelly Pro 4PM (V2)',
        );
        await setPosition(page, 125, 150);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components[0].x_mm,
            )
            .toBe(125);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components[0].y_mm,
            )
            .toBe(150);
        await page.reload();
        await expect(componentNode(page, originalId)).toHaveAttribute(
            'data-x-mm',
            '125',
        );
        await expect(componentNode(page, originalId)).toHaveAttribute(
            'data-y-mm',
            '150',
        );
        await page.screenshot({
            path: testInfo.outputPath('persisted-panel-desktop.png'),
        });
        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Panel designs', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: `Duplicate ${name}`, exact: true })
            .click();
        await expect(
            page.getByRole('link', { name: `${name} (copy)`, exact: true }),
        ).toBeVisible();
        const listing = await api<{ designs: { id: number; name: string }[] }>(
            page,
            '/api/designs',
        );
        const duplicate = listing.designs.find(
            (design) => design.name === `${name} (copy)`,
        );
        expect(duplicate).toBeDefined();
        const duplicated = await readLayout(page, duplicate!.id);
        expect(duplicated.components).toHaveLength(1);
        expect(duplicated.components[0].portable_id).not.toBe(originalId);
        expect(duplicated.components[0].component_definition_id).toBe(
            (await readLayout(page, designId)).components[0]
                .component_definition_id,
        );
        await page
            .getByRole('link', { name: `${name} (copy)`, exact: true })
            .click();
        await expect(
            componentNode(page, duplicated.components[0].portable_id),
        ).toBeVisible();
        await componentNode(page, duplicated.components[0].portable_id).click();
        await inspector(page)
            .getByLabel('Custom label')
            .fill('Independent duplicate');
        await inspector(page).getByLabel('Custom label').blur();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, duplicate!.id)).components[0]
                        .custom_label,
            )
            .toBe('Independent duplicate');
        expect(
            (await readLayout(page, designId)).components[0].custom_label,
        ).toBeNull();
        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Panel designs', exact: true }),
        ).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(
            page.getByRole('link', { name, exact: true }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: testInfo.outputPath('design-list-mobile.png'),
        });
        await page.getByRole('link', { name, exact: true }).click();
        await expect(page.getByTestId('lighting-canvas')).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Components', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Properties / BOM', exact: true }),
        ).toBeVisible();
        await expect(inspector(page)).toBeHidden();
        await page.screenshot({
            path: testInfo.outputPath('collapsed-editor-mobile.png'),
        });
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('routes terminal connections, moves a DIN rail with attached equipment, and restores geometry', async ({
    context,
    page,
}, testInfo) => {
    const name = `Lighting E2E routes ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        await page
            .getByRole('button', { name: 'Add DIN rail', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(1);
        await setPosition(page, 20, 160);
        await expect
            .poll(async () => (await readLayout(page, designId)).rails[0].y_mm)
            .toBe(160);
        const sourceId = await placeComponent(
            page,
            designId,
            'Generic 24V DIN power supply (sample)',
        );
        await setPosition(page, 100, 130);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (item) => item.portable_id === sourceId,
                    )?.rail_portable_id,
            )
            .not.toBeNull();
        const targetId = await placeComponent(
            page,
            designId,
            'Generic ESP32 / I/O controller (sample)',
        );
        await setPosition(page, 250, 350);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (item) => item.portable_id === targetId,
                    )?.y_mm,
            )
            .toBe(350);
        const source = componentNode(page, sourceId).locator(
            '[data-terminal="24V+"]',
        );
        const target = componentNode(page, targetId).locator(
            '[data-terminal="24V+"]',
        );
        await source.dragTo(target);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).connections.length,
            )
            .toBe(1);
        await expect(
            page.getByRole('button', {
                name: 'Move wire segment 2',
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Move wire segment 2', exact: true })
            .dblclick();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).connections[0]
                        .route_points.length,
            )
            .toBeGreaterThan(4);
        const bend = page.getByRole('button', {
            name: 'Move bend 2',
            exact: true,
        });
        const bendBounds = await bend.boundingBox();
        expect(bendBounds).not.toBeNull();
        await page.mouse.move(
            bendBounds!.x + bendBounds!.width / 2,
            bendBounds!.y + bendBounds!.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(bendBounds!.x + 30, bendBounds!.y + 20, {
            steps: 8,
        });
        await page.mouse.up();
        await expect(page.getByRole('status')).toContainText('Saved');
        const beforeMove = await readLayout(page, designId);
        const attachedBefore = beforeMove.components.find(
            (item) => item.portable_id === sourceId,
        )!;
        await page
            .getByTestId(`lighting-rail-${beforeMove.rails[0].portable_id}`)
            .click({ position: { x: 5, y: 5 } });
        await inspector(page).getByLabel('Y (mm)', { exact: true }).fill('210');
        await inspector(page).getByLabel('Y (mm)', { exact: true }).blur();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails[0].y_mm)
            .toBe(210);
        const moved = await readLayout(page, designId);
        expect(
            moved.components.find((item) => item.portable_id === sourceId)!
                .y_mm,
        ).toBe(attachedBefore.y_mm + 50);
        expect(moved.connections[0].route_points[0].y_mm).toBe(
            beforeMove.connections[0].route_points[0].y_mm + 50,
        );
        expect(
            moved.connections[0].route_points.every(
                (point, index, points) =>
                    index === 0 ||
                    point.x_mm === points[index - 1].x_mm ||
                    point.y_mm === points[index - 1].y_mm,
            ),
        ).toBe(true);
        await page.reload();
        await expect(componentNode(page, sourceId)).toHaveAttribute(
            'data-y-mm',
            String(attachedBefore.y_mm + 50),
        );
        expect(
            (await readLayout(page, designId)).connections[0].route_points,
        ).toEqual(moved.connections[0].route_points);
        await page.screenshot({
            path: testInfo.outputPath('routed-panel-desktop.png'),
        });
        await page
            .getByRole('button', { name: 'Show wiring', exact: true })
            .click();
        await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('shows product placeholders when manufacturer images are unavailable at desktop sizes', async ({
    context,
    page,
}, testInfo) => {
    const name = `Lighting E2E images ${randomUUID()}`;
    await openLighting(context, page, true);

    try {
        const designId = await createDesign(page, name);
        const id = await placeComponent(page, designId, 'Shelly Pro 4PM (V2)');
        await expect(
            componentNode(page, id).getByRole('img', {
                name: /Shelly.*SPSW-104PE16EU/,
            }),
        ).toBeVisible();
        await expect(componentNode(page, id).locator('img')).toHaveCount(0);

        for (const width of [1440, 1920]) {
            await page.setViewportSize({ width, height: 1000 });
            await expect(
                page.getByRole('complementary', { name: 'Component palette' }),
            ).toBeVisible();
            await expect(inspector(page)).toBeVisible();
            await expect(page.getByTestId('lighting-canvas')).toBeVisible();
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);
            await page.screenshot({
                path: testInfo.outputPath(`image-fallback-${width}.png`),
            });
        }
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('edits the catalog, uploads a product image, and preserves existing definition revisions', async ({
    context,
    page,
}) => {
    const name = `Lighting E2E catalog ${randomUUID()}`;
    const componentName = `${name} device`;
    let familyId: string | null = null;
    await openLighting(context, page);

    try {
        await page
            .getByRole('link', { name: 'Component catalog', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'New component', exact: true })
            .click();
        const dialog = page.getByRole('dialog', {
            name: 'New component definition',
        });
        await dialog
            .getByLabel('Display name', { exact: true })
            .fill(componentName);
        await dialog
            .getByLabel('Manufacturer', { exact: true })
            .fill('E2E fixture');
        await dialog.getByLabel('Model', { exact: true }).fill('Fixture-60');
        await dialog.getByLabel('Width (mm)', { exact: true }).fill('60.25');
        await dialog.getByLabel('Height (mm)', { exact: true }).fill('90');
        await dialog.getByLabel(/^Local product image/).setInputFiles({
            name: 'lighting-fixture.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=',
                'base64',
            ),
        });
        await dialog
            .getByRole('button', { name: 'Add terminal', exact: true })
            .click();
        await dialog.getByLabel('Key', { exact: true }).fill('T1');
        await dialog.getByLabel('Label', { exact: true }).fill('Power input');
        await dialog.getByLabel('X (mm)', { exact: true }).fill('15');
        await dialog.getByLabel('Y (mm)', { exact: true }).fill('0');
        await dialog
            .getByRole('button', { name: 'Create component', exact: true })
            .click();
        await expect(dialog).toBeHidden();
        const createdDefinitions = await api<{
            definitions: ComponentDefinition[];
        }>(page, '/api/component-definitions');
        const original = createdDefinitions.definitions.find(
            (definition) => definition.display_name === componentName,
        )!;
        expect(original).toBeDefined();
        familyId = original.catalog_family_id;
        expect(original.local_image_url).not.toBeNull();
        expect(original.terminals[0].key).toBe('T1');
        await page
            .getByRole('link', { name: 'Panel designs', exact: true })
            .click();
        const designId = await createDesign(page, name);
        const placedId = await placeComponent(page, designId, componentName);
        await expect(
            componentNode(page, placedId).locator('img'),
        ).toHaveAttribute('src', original.local_image_url!);
        await page
            .getByRole('button', { name: 'Component catalog', exact: true })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Component catalog',
                exact: true,
            }),
        ).toBeVisible();
        const card = page.locator('[data-slot="card"]').filter({
            has: page.getByRole('heading', {
                name: componentName,
                exact: true,
            }),
        });
        await card
            .getByRole('button', { name: 'New revision', exact: true })
            .click();
        const revisionDialog = page.getByRole('dialog', {
            name: `New revision of ${componentName}`,
        });
        await revisionDialog
            .getByLabel('Width (mm)', { exact: true })
            .fill('80');
        await revisionDialog
            .getByRole('button', { name: 'Save new revision', exact: true })
            .click();
        await expect(revisionDialog).toBeHidden();
        await expect(card).toContainText('Revision 2');
        await page
            .getByRole('link', { name: 'Panel designs', exact: true })
            .click();
        await page.getByRole('link', { name, exact: true }).click();
        await expect(componentNode(page, placedId)).toBeVisible();
        const reopened = await readLayout(page, designId);
        expect(reopened.components[0].component_definition_id).toBe(
            original.id,
        );
        expect(
            reopened.definitions.find(
                (definition) => definition.id === original.id,
            )!.width_mm,
        ).toBe(60.25);
        await componentNode(page, placedId).click();
        await expect(inspector(page)).toContainText('rev 1');
        await expect(inspector(page)).toContainText('60.25 mm');
    } finally {
        await cleanupDesigns(page, name);
        const remaining = await api<{ definitions: ComponentDefinition[] }>(
            page,
            '/api/component-definitions',
        );
        const ownDefinition = remaining.definitions.find((definition) =>
            familyId
                ? definition.catalog_family_id === familyId
                : definition.display_name === componentName,
        );

        if (ownDefinition) {
            await api(
                page,
                `/api/component-definitions/${ownDefinition.id}`,
                'DELETE',
            );
        }
    }
});

unmonitoredTest(
    'retains edits and blocks navigation when saving fails, then retries successfully',
    async ({ context, page }) => {
        const name = `Lighting E2E failure ${randomUUID()}`;
        await openLighting(context, page);
        let intercepting = false;

        try {
            const designId = await createDesign(page, name);
            const id = await placeComponent(
                page,
                designId,
                'Shelly Pro 4PM (V2)',
            );
            const failingRoute = `**/api/designs/${designId}/layout`;
            await page.route(failingRoute, (route) =>
                route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Simulated save failure' }),
                }),
            );
            intercepting = true;
            await inspector(page)
                .getByLabel('Custom label')
                .fill('Retained unsaved label');
            await inspector(page).getByLabel('Custom label').blur();
            await expect(page.getByRole('status')).toContainText('Save failed');
            await page
                .getByRole('button', { name: 'Back to designs', exact: true })
                .click();
            const dialog = page.getByRole('dialog', {
                name: 'Unsaved panel changes',
            });
            await expect(dialog).toBeVisible();
            await expect(page).toHaveURL(new RegExp(`/designs/${designId}$`));
            await dialog
                .getByRole('button', { name: 'Stay', exact: true })
                .click();
            await expect(
                inspector(page).getByLabel('Custom label'),
            ).toHaveValue('Retained unsaved label');
            expect(
                (await readLayout(page, designId)).components.find(
                    (item) => item.portable_id === id,
                )!.custom_label,
            ).toBeNull();
            await page.unroute(failingRoute);
            intercepting = false;
            await page
                .getByRole('button', { name: 'Retry', exact: true })
                .click();
            await expect(page.getByRole('status')).toContainText('Saved');
            await expect
                .poll(
                    async () =>
                        (await readLayout(page, designId)).components.find(
                            (item) => item.portable_id === id,
                        )?.custom_label,
                )
                .toBe('Retained unsaved label');
            await page
                .getByRole('button', { name: 'Back to designs', exact: true })
                .click();
            await expect(
                page.getByRole('heading', {
                    name: 'Panel designs',
                    exact: true,
                }),
            ).toBeVisible();
        } finally {
            if (intercepting) {
                await page.unroute('**/api/designs/*/layout');
            }

            await cleanupDesigns(page, name);
        }
    },
);
