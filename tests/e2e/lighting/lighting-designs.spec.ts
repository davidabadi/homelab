import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test as unmonitoredTest } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import type {
    CatalogSnapshot,
    LightingInterchangeDocument,
} from '../../../resources/js/components/lighting/interchange';
import type {
    ComponentDefinition,
    DesignRail,
    LightingLayout,
} from '../../../resources/js/components/lighting/types';
import { expect, test } from '../fixtures/test';

const lightingUrl =
    process.env.PLAYWRIGHT_LIGHTING_URL ?? 'http://lighting.localhost:8000';

const productImageFixture = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="280" viewBox="0 0 180 280">
    <rect x="22" y="8" width="136" height="264" rx="8" fill="#d7dce1" stroke="#919ba4" stroke-width="2"/>
    <rect x="29" y="55" width="122" height="170" rx="5" fill="#f5f6f7"/>
    <rect x="36" y="75" width="108" height="84" rx="3" fill="#263643"/>
    <rect x="46" y="87" width="88" height="39" rx="3" fill="#40798c"/>
    <circle cx="56" cy="143" r="4" fill="#74b69b"/>
    <rect x="43" y="178" width="94" height="5" rx="2" fill="#a7b0b8"/>
    <rect x="55" y="194" width="70" height="5" rx="2" fill="#b9c1c8"/>
    <g fill="#495760"><rect x="38" y="16" width="24" height="31" rx="3"/><rect x="78" y="16" width="24" height="31" rx="3"/><rect x="118" y="16" width="24" height="31" rx="3"/><rect x="38" y="233" width="24" height="31" rx="3"/><rect x="78" y="233" width="24" height="31" rx="3"/><rect x="118" y="233" width="24" height="31" rx="3"/></g>
    <g fill="#8b969f"><circle cx="50" cy="31" r="7"/><circle cx="90" cy="31" r="7"/><circle cx="130" cy="31" r="7"/><circle cx="50" cy="248" r="7"/><circle cx="90" cy="248" r="7"/><circle cx="130" cy="248" r="7"/></g>
</svg>`;

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
            contentType: 'image/svg+xml',
            body: brokenImages
                ? Buffer.from('not an image')
                : Buffer.from(productImageFixture),
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

function panelRow(page: Page, id: string): Locator {
    return page.getByTestId(`lighting-row-${id}`);
}

function orderedRows(layout: LightingLayout) {
    return [...layout.rails].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
}

function orderedRowItems(layout: LightingLayout, rowId: string) {
    return layout.components
        .filter((component) => component.rail_portable_id === rowId)
        .sort(
            (left, right) =>
                left.x_mm - right.x_mm ||
                (left.sort_order ?? 0) - (right.sort_order ?? 0),
        );
}

function rowStructure(layout: LightingLayout) {
    return orderedRows(layout).map((row) => ({
        sort_order: row.sort_order,
        items: orderedRowItems(layout, row.portable_id).map((component) => ({
            component_definition_id: component.component_definition_id,
            sort_order: component.sort_order,
            x_mm: component.x_mm,
            y_mm: component.y_mm,
            custom_label: component.custom_label,
            notes: component.notes,
        })),
    }));
}

function physicalLayout(layout: LightingLayout) {
    const definitions = new Map(
        layout.definitions.map((definition) => [definition.id, definition]),
    );

    return {
        design: {
            width_mm: layout.design.width_mm,
            height_mm: layout.design.height_mm,
            depth_mm: layout.design.depth_mm,
            margin_top_mm: layout.design.margin_top_mm,
            margin_right_mm: layout.design.margin_right_mm,
            margin_bottom_mm: layout.design.margin_bottom_mm,
            margin_left_mm: layout.design.margin_left_mm,
            metadata: layout.design.metadata,
        },
        rows: orderedRows(layout).map((row) => ({
            x_mm: row.x_mm,
            y_mm: row.y_mm,
            length_mm: row.length_mm,
            width_mm: row.width_mm,
            items: orderedRowItems(layout, row.portable_id).map((component) => {
                const definition = definitions.get(
                    component.component_definition_id,
                )!;

                return {
                    catalog_family_id: definition.catalog_family_id,
                    revision: definition.revision,
                    x_mm: component.x_mm,
                    y_mm: component.y_mm,
                    rotation: component.rotation,
                    custom_label: component.custom_label,
                    notes: component.notes,
                    metadata: component.metadata,
                };
            }),
        })),
    };
}

async function dragComponentTo(
    page: Page,
    componentId: string,
    row: DesignRail,
    xMm: number,
    cancel = false,
): Promise<void> {
    const device = componentNode(page, componentId);
    await device.scrollIntoViewIfNeeded();
    const track = page.getByTestId(`lighting-row-track-${row.portable_id}`);
    await track.scrollIntoViewIfNeeded();
    const deviceBounds = await device.boundingBox();
    const trackBounds = await track.boundingBox();
    expect(deviceBounds).not.toBeNull();
    expect(trackBounds).not.toBeNull();
    const grabOffset = deviceBounds!.width / 2;
    const scale = trackBounds!.width / row.length_mm;
    await page.mouse.move(deviceBounds!.x + grabOffset, deviceBounds!.y + 45);
    await page.mouse.down();

    try {
        await page.mouse.move(
            trackBounds!.x + (xMm - row.x_mm) * scale + grabOffset,
            trackBounds!.y + 45,
            { steps: 20 },
        );
        await expect(page.getByTestId('lighting-drag-preview')).toBeVisible();
        await expect(panelRow(page, row.portable_id)).toHaveAttribute(
            'data-drop-state',
            'valid',
        );

        if (cancel) {
            await page.keyboard.press('Escape');
            await expect(
                page.getByTestId('lighting-drag-preview'),
            ).toBeHidden();
        }
    } finally {
        await page.mouse.up();
    }
}

async function exportDesign(page: Page): Promise<{
    path: string;
    document: LightingInterchangeDocument;
    filename: string;
}> {
    await page.getByRole('button', { name: 'Panel menu', exact: true }).click();
    const downloading = page.waitForEvent('download');
    await page
        .getByRole('menuitem', { name: 'Export JSON', exact: true })
        .click();
    const download = await downloading;
    const path = await download.path();
    expect(path).not.toBeNull();
    const contents = await readFile(path!, 'utf8');
    expect(contents).toContain('\n    "');

    return {
        path: path!,
        document: JSON.parse(contents) as LightingInterchangeDocument,
        filename: download.suggestedFilename(),
    };
}

async function expectRowItems(
    page: Page,
    designId: number,
    rowId: string,
    componentIds: string[],
): Promise<void> {
    await expect
        .poll(async () =>
            orderedRowItems(await readLayout(page, designId), rowId).map(
                (component) => component.portable_id,
            ),
        )
        .toEqual(componentIds);
    await expect
        .poll(() =>
            panelRow(page, rowId)
                .locator('[data-component-id]')
                .evaluateAll((elements) =>
                    elements.map((element) =>
                        element.getAttribute('data-component-id'),
                    ),
                ),
        )
        .toEqual(componentIds);
}

async function placeComponent(
    page: Page,
    designId: number,
    name: string,
    rowId?: string,
): Promise<string> {
    const previous = await readLayout(page, designId);
    await page.getByRole('button', { name: 'Add device', exact: true }).click();
    const drawer = page.getByRole('dialog', {
        name: 'Add device',
        exact: true,
    });
    await drawer
        .getByRole('combobox', { name: 'Add to row', exact: true })
        .selectOption(rowId ?? orderedRows(previous)[0].portable_id);
    await drawer.getByLabel('Search components', { exact: true }).fill(name);
    await drawer
        .getByRole('button', { name: `Add ${name}`, exact: true })
        .click();

    if (await drawer.isVisible()) {
        await page.keyboard.press('Escape');
    }

    await expect(drawer).toBeHidden();
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
    await componentNode(page, component!.portable_id).click();

    return component!.portable_id;
}

async function moveComponent(
    page: Page,
    designId: number,
    componentId: string,
    rowId: string,
): Promise<void> {
    await componentNode(page, componentId).click();
    await inspector(page)
        .getByRole('combobox', { name: 'Move to row', exact: true })
        .selectOption(rowId);
    await expect
        .poll(
            async () =>
                (await readLayout(page, designId)).components.find(
                    (component) => component.portable_id === componentId,
                )?.rail_portable_id,
        )
        .toBe(rowId);
    await expect(componentNode(page, componentId)).toHaveAttribute(
        'data-row-id',
        rowId,
    );
}

async function openRowOptions(page: Page, rowId: string): Promise<void> {
    await panelRow(page, rowId)
        .getByRole('button', { name: /Row \d+ options/ })
        .click();
}

test('arranges devices on three rows, reloads, and duplicates an independent panel', async ({
    context,
    page,
}, testInfo) => {
    test.setTimeout(60_000);
    const name = `Lighting E2E ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const initial = await readLayout(page, designId);
        expect(initial.rails).toHaveLength(2);
        expect(initial.components).toHaveLength(0);
        const [firstRow, secondRow] = orderedRows(initial);
        const relayId = await placeComponent(
            page,
            designId,
            'Shelly Pro 4PM (V2)',
            firstRow.portable_id,
        );
        const dimmerId = await placeComponent(
            page,
            designId,
            'Shelly Pro Dimmer 2PM',
            firstRow.portable_id,
        );
        const supplyId = await placeComponent(
            page,
            designId,
            'Generic 24V DIN power supply (sample)',
            firstRow.portable_id,
        );
        await expectRowItems(page, designId, firstRow.portable_id, [
            relayId,
            dimmerId,
            supplyId,
        ]);

        await page
            .getByRole('button', { name: 'Add row', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(3);
        const expanded = await readLayout(page, designId);
        const newRow = expanded.rails.find(
            (row) =>
                !initial.rails.some(
                    (original) => original.portable_id === row.portable_id,
                ),
        )!;
        expect(expanded.design.height_mm).toBeGreaterThan(
            initial.design.height_mm,
        );

        await moveComponent(page, designId, relayId, secondRow.portable_id);
        const terminalId = await placeComponent(
            page,
            designId,
            'Generic terminal block (sample)',
            secondRow.portable_id,
        );
        await expectRowItems(page, designId, secondRow.portable_id, [
            relayId,
            terminalId,
        ]);
        await expect(
            inspector(page).getByRole('button', {
                name: 'Move left',
                exact: true,
            }),
        ).toBeDisabled();
        const beforeNudge = (await readLayout(page, designId)).components.find(
            (component) => component.portable_id === terminalId,
        )!;
        await inspector(page)
            .getByRole('button', { name: 'Move right', exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === terminalId,
                    )?.x_mm,
            )
            .toBe(beforeNudge.x_mm + 1);
        const relayDefinition = (
            await readLayout(page, designId)
        ).definitions.find(
            (definition) => definition.display_name === 'Shelly Pro 4PM (V2)',
        )!;
        await dragComponentTo(
            page,
            relayId,
            secondRow,
            Math.floor(
                secondRow.x_mm + secondRow.length_mm - relayDefinition.width_mm,
            ),
        );
        await expectRowItems(page, designId, secondRow.portable_id, [
            terminalId,
            relayId,
        ]);
        await dragComponentTo(page, relayId, secondRow, secondRow.x_mm);
        await expectRowItems(page, designId, secondRow.portable_id, [
            relayId,
            terminalId,
        ]);
        await moveComponent(page, designId, supplyId, newRow.portable_id);
        await expectRowItems(page, designId, firstRow.portable_id, [dimmerId]);
        await expectRowItems(page, designId, newRow.portable_id, [supplyId]);

        const original = await readLayout(page, designId);
        await page.reload();
        await expectRowItems(page, designId, firstRow.portable_id, [dimmerId]);
        await expectRowItems(page, designId, secondRow.portable_id, [
            relayId,
            terminalId,
        ]);
        await expectRowItems(page, designId, newRow.portable_id, [supplyId]);
        expect(rowStructure(await readLayout(page, designId))).toEqual(
            rowStructure(original),
        );
        await expect(page.locator('.react-flow')).toHaveCount(0);
        await page.screenshot({
            path: testInfo.outputPath('persisted-three-row-panel-desktop.png'),
        });

        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();
        await page
            .getByRole('button', { name: `Duplicate ${name}`, exact: true })
            .click();
        const copyName = `${name} (copy)`;
        await expect(
            page.getByRole('link', { name: copyName, exact: true }),
        ).toBeVisible();
        const listing = await api<{ designs: { id: number; name: string }[] }>(
            page,
            '/api/designs',
        );
        const duplicate = listing.designs.find(
            (design) => design.name === copyName,
        )!;
        const duplicated = await readLayout(page, duplicate.id);
        expect(rowStructure(duplicated)).toEqual(rowStructure(original));
        expect(duplicated.components).toHaveLength(4);

        for (const row of duplicated.rails) {
            expect(
                original.rails.map((item) => item.portable_id),
            ).not.toContain(row.portable_id);
        }

        for (const component of duplicated.components) {
            expect(
                original.components.map((item) => item.portable_id),
            ).not.toContain(component.portable_id);
        }

        await page.getByRole('link', { name: copyName, exact: true }).click();
        const copiedItem = orderedRowItems(
            duplicated,
            orderedRows(duplicated)[0].portable_id,
        )[0];
        await componentNode(page, copiedItem.portable_id).click();
        await inspector(page)
            .getByLabel('Custom label')
            .fill('Independent duplicate');
        await inspector(page).getByLabel('Custom label').blur();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, duplicate.id)).components.find(
                        (item) => item.portable_id === copiedItem.portable_id,
                    )?.custom_label,
            )
            .toBe('Independent duplicate');
        expect(rowStructure(await readLayout(page, designId))).toEqual(
            rowStructure(original),
        );

        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();
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
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('keeps intentional DIN gaps through reload and a JSON export/import round trip', async ({
    context,
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    const name = `Lighting E2E roundtrip ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const initial = await readLayout(page, designId);
        const row = orderedRows(initial)[0];
        const rightId = await placeComponent(
            page,
            designId,
            'Shelly Pro 4PM (V2)',
            row.portable_id,
        );
        const rightDefinition = (
            await readLayout(page, designId)
        ).definitions.find(
            (definition) => definition.display_name === 'Shelly Pro 4PM (V2)',
        )!;
        const farRightX = Math.floor(
            row.x_mm + row.length_mm - rightDefinition.width_mm,
        );
        await dragComponentTo(page, rightId, row, farRightX);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === rightId,
                    )?.x_mm,
            )
            .toBe(farRightX);
        await expect(componentNode(page, rightId)).toHaveAttribute(
            'data-x-mm',
            String(farRightX),
        );
        const beforeCancel = await readLayout(page, designId);
        const secondRow = orderedRows(initial)[1];
        await dragComponentTo(page, rightId, secondRow, farRightX, true);
        expect(physicalLayout(await readLayout(page, designId))).toEqual(
            physicalLayout(beforeCancel),
        );
        await page
            .getByRole('button', { name: 'Add device to Row 02', exact: true })
            .click();
        await expect(
            page.getByRole('dialog', { name: 'Add device', exact: true }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await dragComponentTo(page, rightId, secondRow, farRightX);
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === rightId,
                    )?.rail_portable_id,
            )
            .toBe(secondRow.portable_id);
        await page
            .getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === rightId,
                    )?.rail_portable_id,
            )
            .toBe(row.portable_id);
        await page
            .getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === rightId,
                    )?.rail_portable_id,
            )
            .toBe(secondRow.portable_id);
        await page
            .getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === rightId,
                    )?.rail_portable_id,
            )
            .toBe(row.portable_id);
        await componentNode(page, rightId).click();
        await inspector(page).getByLabel('Custom label').fill('Right group');
        await inspector(page).getByLabel('Custom label').blur();

        const leftId = await placeComponent(
            page,
            designId,
            'Shelly Pro Dimmer 2PM',
            row.portable_id,
        );
        await inspector(page).getByLabel('Custom label').fill('Left group');
        await inspector(page).getByLabel('Custom label').blur();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).components.find(
                        (component) => component.portable_id === leftId,
                    )?.custom_label,
            )
            .toBe('Left group');
        const original = await readLayout(page, designId);
        const left = original.components.find(
            (component) => component.portable_id === leftId,
        )!;
        const right = original.components.find(
            (component) => component.portable_id === rightId,
        )!;
        const leftDefinition = original.definitions.find(
            (definition) => definition.id === left.component_definition_id,
        )!;
        expect(left.x_mm).toBe(row.x_mm);
        expect(
            right.x_mm - left.x_mm - leftDefinition.width_mm,
        ).toBeGreaterThan(100);
        await expect(panelRow(page, row.portable_id)).toContainText(
            'largest gap',
        );

        await page.reload();
        await expect(componentNode(page, leftId)).toHaveAttribute(
            'data-x-mm',
            String(left.x_mm),
        );
        await expect(componentNode(page, rightId)).toHaveAttribute(
            'data-x-mm',
            String(right.x_mm),
        );
        expect(physicalLayout(await readLayout(page, designId))).toEqual(
            physicalLayout(original),
        );
        await page.screenshot({
            path: testInfo.outputPath('persistent-large-din-gap.png'),
        });

        const exported = await exportDesign(page);
        expect(exported.filename).toMatch(/\.lighting\.json$/);
        expect(exported.document.format).toBe('homelab-lighting-design');
        expect(exported.document.schema_version).toBe(1);
        expect(exported.document.design).not.toHaveProperty('id');
        expect(exported.document.components[0]).not.toHaveProperty(
            'component_definition_id',
        );
        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Import Design', exact: true })
            .click();
        const dialog = page.getByRole('dialog', {
            name: 'Import Design',
            exact: true,
        });
        await dialog
            .getByLabel('Design JSON file')
            .setInputFiles(exported.path);
        await expect(dialog.getByLabel('New design name')).toHaveValue(
            `${name} (imported)`,
        );
        await expect(dialog).toContainText('All resolved');
        await expect(
            dialog.getByRole('button', {
                name: 'Import new design',
                exact: true,
            }),
        ).toBeEnabled();
        await dialog
            .getByRole('button', { name: 'Import new design', exact: true })
            .click();
        await expect(page).toHaveURL(/\/designs\/\d+$/);
        const importedId = Number(
            new URL(page.url()).pathname.split('/').at(-1),
        );
        expect(importedId).not.toBe(designId);
        const imported = await readLayout(page, importedId);
        expect(physicalLayout(imported)).toEqual(physicalLayout(original));

        for (const importedRow of imported.rails) {
            expect(
                original.rails.map((item) => item.portable_id),
            ).not.toContain(importedRow.portable_id);
        }

        for (const component of imported.components) {
            expect(
                original.components.map((item) => item.portable_id),
            ).not.toContain(component.portable_id);
            await expect(
                componentNode(page, component.portable_id),
            ).toHaveAttribute('data-x-mm', String(component.x_mm));
        }

        const importedRight = imported.components.find(
            (component) => component.custom_label === 'Right group',
        )!;
        await componentNode(page, importedRight.portable_id).click();
        await inspector(page).getByLabel('Custom label').fill('Imported only');
        await inspector(page).getByLabel('Custom label').blur();
        await expect
            .poll(
                async () =>
                    (await readLayout(page, importedId)).components.find(
                        (component) =>
                            component.portable_id === importedRight.portable_id,
                    )?.custom_label,
            )
            .toBe('Imported only');
        expect(
            (await readLayout(page, designId)).components.find(
                (component) => component.portable_id === rightId,
            )?.custom_label,
        ).toBe('Right group');
        await page.screenshot({
            path: testInfo.outputPath('imported-physical-layout.png'),
        });
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('requires review of missing catalog snapshots and keeps explicitly created components after cancel', async ({
    context,
    page,
}) => {
    test.setTimeout(90_000);
    const name = `Lighting E2E import catalog ${randomUUID()}`;
    const componentName = `${name} component`;
    const familyId = randomUUID();
    await openLighting(context, page);

    try {
        const originalId = await createDesign(page, name);
        await placeComponent(page, originalId, 'Shelly Pro 4PM (V2)');
        const exported = await exportDesign(page);
        const snapshot = exported.document.catalog[0] as CatalogSnapshot;
        snapshot.catalog_family_id = familyId;
        snapshot.manufacturer = 'E2E import fixture';
        snapshot.model = 'Imported-controller';
        snapshot.display_name = componentName;
        snapshot.image_url = null;
        snapshot.datasheet_url = null;
        snapshot.has_local_image = true;
        snapshot.metadata = {
            imported_fixture: true,
            product_note: 'Preserved snapshot',
        };
        exported.document.design.name = `${name} fixture`;

        for (const component of exported.document.components) {
            component.catalog_ref = {
                catalog_family_id: familyId,
                revision: snapshot.revision,
            };
        }

        const file = {
            name: 'missing-catalog.lighting.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(exported.document, null, 2)),
        };
        await page
            .getByRole('button', { name: 'Back to designs', exact: true })
            .click();

        async function openImport(): Promise<Locator> {
            await page
                .getByRole('button', { name: 'Import Design', exact: true })
                .click();
            const dialog = page.getByRole('dialog', {
                name: 'Import Design',
                exact: true,
            });
            await dialog.getByLabel('Design JSON file').setInputFiles(file);

            return dialog;
        }

        let dialog = await openImport();
        await expect(dialog).toContainText('1 to resolve');
        await expect(
            dialog.getByRole('button', {
                name: 'Import new design',
                exact: true,
            }),
        ).toBeDisabled();
        await expect(
            dialog.getByText('Missing', { exact: true }),
        ).toBeVisible();
        const beforeCancel = await api<{
            designs: { id: number; name: string }[];
        }>(page, '/api/designs');
        expect(
            beforeCancel.designs.filter((design) =>
                design.name.startsWith(name),
            ),
        ).toHaveLength(1);
        await dialog
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        await expect(dialog).toBeHidden();
        const untouchedCatalog = await api<{
            definitions: ComponentDefinition[];
        }>(page, '/api/component-definitions');
        expect(
            untouchedCatalog.definitions.some(
                (definition) => definition.catalog_family_id === familyId,
            ),
        ).toBe(false);

        dialog = await openImport();
        await expect(dialog).toContainText('1 to resolve');
        await dialog
            .getByRole('button', { name: 'Create component', exact: true })
            .click();
        const editor = page.getByRole('dialog', {
            name: `Create ${componentName}`,
            exact: true,
        });
        await expect(
            editor.getByLabel('Display name', { exact: true }),
        ).toHaveValue(componentName);
        await expect(
            editor.getByLabel('Manufacturer', { exact: true }),
        ).toHaveValue(snapshot.manufacturer);
        await expect(editor.getByLabel('Model', { exact: true })).toHaveValue(
            snapshot.model,
        );
        await expect(
            editor.getByLabel('Width (mm)', { exact: true }),
        ).toHaveValue(String(snapshot.width_mm));
        await expect(
            editor.getByLabel('Height (mm)', { exact: true }),
        ).toHaveValue(String(snapshot.height_mm));

        if (snapshot.terminals.length > 0) {
            await expect(
                editor.getByLabel('Key', { exact: true }).first(),
            ).toHaveValue(snapshot.terminals[0].key);
        }

        await editor
            .getByText('Product metadata (JSON)', { exact: true })
            .click();
        expect(
            JSON.parse(await editor.getByLabel('Metadata JSON').inputValue()),
        ).toEqual(snapshot.metadata);
        await expect(editor).toContainText('had a local product image');
        await editor.getByLabel(/^Local product image/).setInputFiles({
            name: 'lighting-import-fixture.png',
            mimeType: 'image/png',
            buffer: await readFile('public/icons/homelab.png'),
        });
        await editor
            .getByRole('button', { name: 'Create component', exact: true })
            .click();
        await expect(editor).toBeHidden();
        dialog = page.getByRole('dialog', {
            name: 'Import Design',
            exact: true,
        });
        await expect(dialog).toContainText('All resolved');
        await expect(
            dialog.getByRole('button', {
                name: 'Import new design',
                exact: true,
            }),
        ).toBeEnabled();
        await expect(dialog).toContainText('even if you cancel');
        await dialog
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        const createdCatalog = await api<{
            definitions: ComponentDefinition[];
        }>(page, '/api/component-definitions');
        const created = createdCatalog.definitions.find(
            (definition) => definition.catalog_family_id === familyId,
        )!;
        expect(created).toBeDefined();
        expect(created.revision).toBe(snapshot.revision);
        expect(created.metadata).toEqual(snapshot.metadata);
        expect(created.local_image_url).not.toBeNull();
        const afterCancel = await api<{
            designs: { id: number; name: string }[];
        }>(page, '/api/designs');
        expect(
            afterCancel.designs.filter((design) =>
                design.name.startsWith(name),
            ),
        ).toHaveLength(1);

        dialog = await openImport();
        await expect(
            dialog.getByText('Matched', { exact: true }),
        ).toBeVisible();
        await expect(
            dialog.getByRole('button', {
                name: 'Create component',
                exact: true,
            }),
        ).toHaveCount(0);
        await dialog
            .getByRole('button', { name: 'Import new design', exact: true })
            .click();
        await expect(page).toHaveURL(/\/designs\/\d+$/);
        const importedId = Number(
            new URL(page.url()).pathname.split('/').at(-1),
        );
        expect(importedId).not.toBe(originalId);
        const imported = await readLayout(page, importedId);
        expect(imported.components).toHaveLength(1);
        expect(imported.components[0].component_definition_id).toBe(created.id);
        await expect(
            componentNode(page, imported.components[0].portable_id).locator(
                'img',
            ),
        ).toHaveAttribute('src', created.local_image_url!);
    } finally {
        await cleanupDesigns(page, name);
        const catalog = await api<{ definitions: ComponentDefinition[] }>(
            page,
            '/api/component-definitions',
        );
        const fixture = catalog.definitions.find(
            (definition) => definition.catalog_family_id === familyId,
        );

        if (fixture) {
            await api(
                page,
                `/api/component-definitions/${fixture.id}`,
                'DELETE',
            );
        }
    }
});

test('inserts and reorders rows and only removes empty rows', async ({
    context,
    page,
}) => {
    test.setTimeout(60_000);
    const name = `Lighting E2E rows ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const originalRows = orderedRows(await readLayout(page, designId));
        const firstId = originalRows[0].portable_id;
        await openRowOptions(page, firstId);
        await page
            .getByRole('menuitem', { name: 'Add row above', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(3);
        const aboveId = orderedRows(await readLayout(page, designId))[0]
            .portable_id;
        expect(aboveId).not.toBe(firstId);

        await openRowOptions(page, firstId);
        await page
            .getByRole('menuitem', { name: 'Add row below', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(4);
        const inserted = orderedRows(await readLayout(page, designId));
        const belowId = inserted[2].portable_id;
        expect(inserted.map((row) => row.portable_id)).toEqual([
            aboveId,
            firstId,
            belowId,
            originalRows[1].portable_id,
        ]);

        await openRowOptions(page, firstId);
        await page
            .getByRole('menuitem', { name: 'Move row down', exact: true })
            .click();
        await expect
            .poll(async () =>
                orderedRows(await readLayout(page, designId)).map(
                    (row) => row.portable_id,
                ),
            )
            .toEqual([aboveId, belowId, firstId, originalRows[1].portable_id]);

        await placeComponent(page, designId, 'Shelly Pro Dimmer 2PM', firstId);
        await openRowOptions(page, firstId);
        await expect(
            page.getByRole('menuitem', {
                name: 'Remove empty row',
                exact: true,
            }),
        ).toBeDisabled();
        await page.keyboard.press('Escape');
        await openRowOptions(page, aboveId);
        await page
            .getByRole('menuitem', { name: 'Remove empty row', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(3);
        await expect(panelRow(page, aboveId)).toBeHidden();

        await page.reload();
        await expect
            .poll(async () =>
                orderedRows(await readLayout(page, designId)).map(
                    (row) => row.portable_id,
                ),
            )
            .toEqual([belowId, firstId, originalRows[1].portable_id]);
        await expect(
            panelRow(page, firstId).locator('[data-component-id]'),
        ).toHaveCount(1);
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('contains product images and keeps image fallbacks and labels readable at desktop sizes', async ({
    context,
    page,
}, testInfo) => {
    const name = `Lighting E2E images ${randomUUID()}`;
    await openLighting(context, page, true);

    try {
        const designId = await createDesign(page, name);
        const id = await placeComponent(page, designId, 'Shelly Pro 4PM (V2)');
        const device = componentNode(page, id);
        await expect(
            device.getByRole('img', { name: /Shelly.*SPSW-104PE16EU/ }),
        ).toBeVisible();
        await expect(device.locator('img')).toHaveCount(0);
        await expect(device).toContainText('Shelly Pro 4PM (V2)');
        await expect(device.locator('[data-terminal]')).toHaveCount(0);
        const primaryLabel = device.getByText('Shelly Pro 4PM (V2)', {
            exact: true,
        });
        expect(
            await primaryLabel.evaluate((element) =>
                Number.parseFloat(getComputedStyle(element).fontSize),
            ),
        ).toBeGreaterThanOrEqual(12);

        for (const width of [1440, 1920]) {
            await page.setViewportSize({ width, height: 1000 });
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

        const fallbackBounds = await device.boundingBox();
        expect(fallbackBounds).not.toBeNull();

        await page.unroute('https://kb.shelly.cloud/**');
        await page.route('https://kb.shelly.cloud/**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'image/svg+xml',
                body: productImageFixture,
            }),
        );
        await page.reload();
        const image = componentNode(page, id).locator('img');
        await expect(image).toBeVisible();
        await expect
            .poll(() =>
                image.evaluate(
                    (element: HTMLImageElement) => element.naturalWidth,
                ),
            )
            .toBe(180);
        expect(
            await image.evaluate(
                (element) => getComputedStyle(element).objectFit,
            ),
        ).toBe('contain');
        const imageBounds = await componentNode(page, id).boundingBox();
        expect(imageBounds?.width).toBe(fallbackBounds!.width);
        expect(imageBounds?.height).toBe(fallbackBounds!.height);
        await page.screenshot({
            path: testInfo.outputPath('contained-device-image-desktop.png'),
        });
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
            buffer: await readFile('public/icons/homelab.png'),
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
            .getByRole('button', { name: 'Panel menu', exact: true })
            .click();
        await page
            .getByRole('menuitem', { name: 'Component catalog', exact: true })
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
