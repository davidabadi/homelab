import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test as unmonitoredTest } from '@playwright/test';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { cableEntryPoint } from '../../../resources/js/components/lighting/external-cabling';
import { terminalPoint } from '../../../resources/js/components/lighting/geometry';
import type {
    CatalogSnapshot,
    LightingInterchangeDocument,
} from '../../../resources/js/components/lighting/interchange';
import { layoutSnapshot } from '../../../resources/js/components/lighting/layout-state';
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

async function editCablingField(
    page: Page,
    label: string,
    value: string,
): Promise<void> {
    await inspector(page).getByLabel(label, { exact: true }).fill(value);
    await inspector(page).getByLabel(label, { exact: true }).press('Tab');
}

async function openCablingDialog(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Panel menu', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'External cabling', exact: true })
        .click();
    const dialog = page.getByRole('dialog', {
        name: 'External cabling',
        exact: true,
    });
    await expect(dialog).toBeVisible();

    return dialog;
}

async function selectCablingObject(
    page: Page,
    portableId: string,
): Promise<void> {
    const dialog = await openCablingDialog(page);
    await dialog.getByTestId(`lighting-cabling-item-${portableId}`).click();
    await expect(dialog).toBeHidden();
}

async function addCableEntry(
    page: Page,
    designId: number,
    label: string,
    side: string,
    offset: number,
): Promise<string> {
    await page.getByRole('button', { name: 'Panel menu', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Add cable entry', exact: true })
        .click();
    await editCablingField(page, 'Entry label', label);
    await inspector(page)
        .getByLabel('Enclosure side', { exact: true })
        .selectOption(side);
    await editCablingField(page, 'Opening span (mm)', '20');
    await editCablingField(page, 'Offset (mm)', String(offset));
    await inspector(page)
        .getByLabel('Entry type', { exact: true })
        .selectOption('conduit');
    await expect
        .poll(async () =>
            (await readLayout(page, designId)).cable_entries.find(
                (entry) => entry.label === label,
            ),
        )
        .toMatchObject({
            side,
            offset_mm: offset,
            span_mm: 20,
            entry_type: 'conduit',
        });

    return (await readLayout(page, designId)).cable_entries.find(
        (entry) => entry.label === label,
    )!.portable_id;
}

async function addCableBundle(
    page: Page,
    designId: number,
    name: string,
    cableClass: string,
    direction: string,
    location: string,
    plannedCount: number,
): Promise<string> {
    await inspector(page)
        .getByRole('button', { name: 'Add bundle', exact: true })
        .click();
    await editCablingField(page, 'Bundle name', name);
    await editCablingField(page, 'External location', location);
    await inspector(page)
        .getByLabel('Cable class', { exact: true })
        .selectOption(cableClass);
    await inspector(page)
        .getByLabel('Direction', { exact: true })
        .selectOption(direction);
    await editCablingField(page, 'Planned cables', String(plannedCount));
    await expect
        .poll(
            async () =>
                (await readLayout(page, designId)).cable_bundles.find(
                    (bundle) => bundle.name === name,
                )?.planned_count,
        )
        .toBe(plannedCount);

    return (await readLayout(page, designId)).cable_bundles.find(
        (bundle) => bundle.name === name,
    )!.portable_id;
}

async function addExternalCable(
    page: Page,
    designId: number,
    bundleId: string,
    label: string,
    cableType: string,
    componentId?: string,
    terminal?: string,
): Promise<string> {
    await selectCablingObject(page, bundleId);
    await inspector(page)
        .getByRole('button', { name: 'Add cable', exact: true })
        .click();
    await editCablingField(page, 'Cable label', label);
    await editCablingField(page, 'Cable type', cableType);

    if (componentId && terminal) {
        await inspector(page)
            .getByLabel('Internal component', { exact: true })
            .selectOption(componentId);
        await inspector(page)
            .getByLabel('Internal terminal', { exact: true })
            .selectOption(terminal);
    }

    await expect
        .poll(async () =>
            (await readLayout(page, designId)).external_cables.find(
                (cable) => cable.label === label,
            ),
        )
        .toMatchObject({
            cable_type: cableType,
            bundle_portable_id: bundleId,
            internal_component_portable_id: componentId ?? null,
            internal_terminal: terminal ?? null,
        });

    return (await readLayout(page, designId)).external_cables.find(
        (cable) => cable.label === label,
    )!.portable_id;
}

function physicalExternalCabling(layout: LightingLayout) {
    return {
        entries: layout.cable_entries.map((entry) => ({
            ...entry,
            portable_id: undefined,
        })),
        bundles: layout.cable_bundles.map(
            ({ cable_entry_portable_id, ...bundle }) => ({
                ...bundle,
                portable_id: undefined,
                entry: layout.cable_entries.find(
                    (entry) => entry.portable_id === cable_entry_portable_id,
                )?.label,
            }),
        ),
        cables: layout.external_cables.map(
            ({
                bundle_portable_id,
                cable_entry_portable_id,
                internal_component_portable_id,
                ...cable
            }) => ({
                ...cable,
                portable_id: undefined,
                bundle:
                    layout.cable_bundles.find(
                        (bundle) => bundle.portable_id === bundle_portable_id,
                    )?.name ?? null,
                entry:
                    layout.cable_entries.find(
                        (entry) =>
                            entry.portable_id === cable_entry_portable_id,
                    )?.label ?? null,
                component: layout.components
                    .filter(
                        (component) =>
                            component.portable_id ===
                            internal_component_portable_id,
                    )
                    .map((component) => {
                        const definition = layout.definitions.find(
                            (item) =>
                                item.id === component.component_definition_id,
                        )!;

                        return {
                            catalog_family_id: definition.catalog_family_id,
                            revision: definition.revision,
                            custom_label: component.custom_label,
                            x_mm: component.x_mm,
                            y_mm: component.y_mm,
                        };
                    }),
            }),
        ),
    };
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

async function createWiringFixture(page: Page, name: string) {
    const designId = await createDesign(page, name);
    const layout = await readLayout(page, designId);
    const { definitions } = await api<{ definitions: ComponentDefinition[] }>(
        page,
        '/api/component-definitions',
    );
    const row = orderedRows(layout)[0];
    const names = [
        'Shelly Pro Dimmer 2PM',
        'Generic 24V DIN power supply (sample)',
        'Generic ESP32 / I/O controller (sample)',
    ];
    const labels = [
        'Living room dimmer',
        '24V power supply',
        'Keypad controller',
    ];
    const placedDefinitions = names.map((name) => {
        const definition = definitions.find(
            (item) => item.display_name === name,
        );
        expect(definition, `fixture catalogue contains ${name}`).toBeDefined();

        return definition!;
    });
    layout.definitions = placedDefinitions;
    layout.components = placedDefinitions.map((definition, index) => ({
        portable_id: randomUUID(),
        component_definition_id: definition.id,
        sort_order: index,
        x_mm: row.x_mm + [20, 110, 220][index],
        y_mm:
            row.y_mm +
            row.width_mm / 2 -
            (definition.mounting_anchor_y_mm ?? definition.height_mm / 2),
        rotation: 0,
        custom_label: labels[index],
        rail_portable_id:
            definition.mounting_type === 'din-rail' ? row.portable_id : null,
        notes: index === 0 ? 'Living and dining lighting circuits' : null,
        metadata: {},
    }));
    const point = (x_mm: number, y_mm: number) => ({ x_mm, y_mm });
    const endpoint = (index: number, terminal: string) =>
        terminalPoint(
            layout.components[index],
            placedDefinitions[index],
            terminal,
        );
    const through = (
        source: { x_mm: number; y_mm: number },
        target: { x_mm: number; y_mm: number },
        y: number,
    ) => [
        source,
        point(80, source.y_mm),
        point(80, y),
        point(250, y),
        point(250, target.y_mm),
        target,
    ];
    const wireEndpoints = [
        {
            source: 0,
            sourceTerminal: 'N',
            target: 1,
            targetTerminal: 'N',
            label: 'Neutral jumper',
        },
        {
            source: 1,
            sourceTerminal: '24V+',
            target: 2,
            targetTerminal: '24V+',
            label: 'Controller supply',
        },
        {
            source: 2,
            sourceTerminal: 'GPIO01',
            target: 0,
            targetTerminal: 'SW1',
            label: 'Keypad control',
        },
    ];
    layout.connections = wireEndpoints.map((wire, index) => ({
        portable_id: randomUUID(),
        source_portable_id: layout.components[wire.source].portable_id,
        source_terminal: wire.sourceTerminal,
        target_portable_id: layout.components[wire.target].portable_id,
        target_terminal: wire.targetTerminal,
        cable_type: wire.label,
        color: '#60a5fa',
        gauge: '18 AWG',
        conductor_count: 1,
        route_points: through(
            endpoint(wire.source, wire.sourceTerminal),
            endpoint(wire.target, wire.targetTerminal),
            185 + 25 * index,
        ),
        actual_length_mm: null,
        notes: wire.label,
    }));
    const entry = {
        portable_id: randomUUID(),
        label: 'Bottom lighting entry',
        side: 'bottom' as const,
        offset_mm: 60,
        span_mm: 20,
        entry_type: 'conduit' as const,
        notes: 'Lighting field cables',
        metadata: {},
    };
    const origin = cableEntryPoint(entry, layout.design);
    const bundle = {
        portable_id: randomUUID(),
        cable_entry_portable_id: entry.portable_id,
        name: 'Lighting circuits',
        external_location: 'Living and dining rooms',
        cable_class: 'line_voltage' as const,
        direction: 'mixed' as const,
        display_color: null,
        planned_count: 4,
        route_points: [origin, point(origin.x_mm, 185), point(80, 185)],
        notes: 'One planned run remains undefined',
        metadata: {},
    };
    layout.cable_entries = [entry];
    layout.cable_bundles = [bundle];
    layout.external_cables = [
        'Living ceiling',
        'AC Feed Neutral',
        'Main bedroom – left keypad (unassigned)',
    ].map((label, index) => {
        const terminal = index === 0 ? 'O1' : 'N';
        const target = endpoint(0, terminal);

        return {
            portable_id: randomUUID(),
            bundle_portable_id: bundle.portable_id,
            cable_entry_portable_id: null,
            label,
            cable_type: '14/3 field cable',
            gauge: '14 AWG',
            conductor_count: 3,
            internal_component_portable_id:
                index < 2 ? layout.components[0].portable_id : null,
            internal_terminal: index < 2 ? terminal : null,
            branch_route_points:
                index < 2
                    ? [
                          point(80, 185),
                          point(250, 185),
                          point(250, target.y_mm),
                          target,
                      ]
                    : [],
            cable_class: null,
            direction: null,
            notes: index === 2 ? 'Assign after room schedule review' : label,
            metadata: {},
        };
    });
    await api(page, `/api/designs/${designId}/layout`, 'PUT', {
        ...layoutSnapshot(layout),
        base_version: layout.design.save_version,
        mutation_id: randomUUID(),
    });
    await page.reload();
    await expect(page.getByTestId('lighting-canvas')).toBeVisible();

    return { designId, layout };
}

async function enterWiringView(page: Page) {
    await page.getByRole('button', { name: 'Panel menu', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Wiring view', exact: true })
        .click();
    await expect(page.locator('.react-flow__viewport')).toBeVisible();
}

async function clickWiringPoint(page: Page, x: number, y: number) {
    const position = await page.locator('.react-flow').evaluate(
        (element, point) => {
            const bounds = element.getBoundingClientRect();
            const viewport = element.querySelector('.react-flow__viewport')!;
            const transform = new DOMMatrix(
                getComputedStyle(viewport).transform,
            );

            return {
                x: bounds.left + transform.e + point.x * 4 * transform.a,
                y: bounds.top + transform.f + point.y * 4 * transform.d,
            };
        },
        { x, y },
    );
    await page.mouse.click(position.x, position.y);
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
    const initialDeviceBounds = await device.boundingBox();
    expect(initialDeviceBounds).not.toBeNull();
    await device.click({
        trial: true,
        position: { x: initialDeviceBounds!.width / 2, y: 45 },
    });
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

async function dragCablingHandle(
    page: Page,
    handle: Locator,
    delta: { x: number; y: number },
    preview: () => Promise<void>,
    cancel = false,
): Promise<void> {
    await handle.scrollIntoViewIfNeeded();
    await handle.click({ trial: true });
    const bounds = await handle.boundingBox();
    expect(bounds).not.toBeNull();
    const origin = {
        x: bounds!.x + bounds!.width / 2,
        y: bounds!.y + bounds!.height / 2,
    };
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();

    try {
        await page.mouse.move(origin.x + delta.x, origin.y + delta.y, {
            steps: 20,
        });
        await preview();

        if (cancel) {
            await page.keyboard.press('Escape');
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
        .first()
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

test('documents external bundles, follows a growing enclosure, and preserves cabling through JSON import', async ({
    context,
    page,
}, testInfo) => {
    test.setTimeout(180_000);
    const name = `External cabling E2E ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const initial = await readLayout(page, designId);
        const supplyId = await placeComponent(
            page,
            designId,
            'Generic 24V DIN power supply (sample)',
        );
        const relayId = await placeComponent(
            page,
            designId,
            'Shelly Pro 4PM (V2)',
        );
        const dimmerId = await placeComponent(
            page,
            designId,
            'Shelly Pro Dimmer 2PM',
            orderedRows(initial)[1].portable_id,
        );

        const bottomEntry = await addCableEntry(
            page,
            designId,
            'AC mains',
            'bottom',
            20,
        );
        const acBundle = await addCableBundle(
            page,
            designId,
            'AC Feed',
            'line_voltage',
            'incoming',
            'Electrical panel',
            1,
        );
        await addExternalCable(
            page,
            designId,
            acBundle,
            'Power supply AC',
            'AC feed',
            supplyId,
            'L',
        );

        await addCableEntry(page, designId, 'Keypads', 'top', 260);
        const keypadBundle = await addCableBundle(
            page,
            designId,
            'Keypads — Rooms',
            'low_voltage_control',
            'incoming',
            'Bedrooms and studio',
            8,
        );

        for (let index = 0; index < 8; index++) {
            await addExternalCable(
                page,
                designId,
                keypadBundle,
                `Room keypad ${index + 1}`,
                'Control cable',
                index < 4 ? relayId : undefined,
                index < 4 ? `S${index + 1}` : undefined,
            );
        }

        const networkEntry = await addCableEntry(
            page,
            designId,
            'Network rack',
            'left',
            110,
        );
        const networkBundle = await addCableBundle(
            page,
            designId,
            'Network',
            'data',
            'incoming',
            'Network rack',
            1,
        );
        await addExternalCable(
            page,
            designId,
            networkBundle,
            'Controller Ethernet',
            'Cat6',
            relayId,
            'LAN',
        );

        await addCableEntry(page, designId, 'Lighting loads', 'top', 40);
        const loadsBundle = await addCableBundle(
            page,
            designId,
            'Lighting Loads',
            'line_voltage',
            'outgoing',
            'Living areas',
            2,
        );
        await addExternalCable(
            page,
            designId,
            loadsBundle,
            'Living ceiling',
            'Lighting circuit',
            dimmerId,
            'O1',
        );
        await addExternalCable(
            page,
            designId,
            loadsBundle,
            'Dining chandelier',
            'Lighting circuit',
            dimmerId,
            'O2',
        );

        const defined = await readLayout(page, designId);
        expect(defined.cable_entries).toHaveLength(4);
        expect(defined.cable_bundles).toHaveLength(4);
        expect(defined.external_cables).toHaveLength(12);
        expect(
            defined.external_cables.filter(
                (cable) => cable.internal_component_portable_id === null,
            ),
        ).toHaveLength(4);
        expect(
            defined.cable_bundles.find(
                (bundle) => bundle.portable_id === keypadBundle,
            )?.planned_count,
        ).toBe(8);

        await page
            .getByRole('button', { name: 'Panel menu', exact: true })
            .click();
        await page
            .getByRole('menuitem', { name: 'Wiring view', exact: true })
            .click();
        await expect(
            page.getByTestId(`lighting-bundle-trunk-${keypadBundle}`),
        ).toHaveCount(1);
        await expect(
            page.getByTestId(`lighting-bundle-trunk-${keypadBundle}`),
        ).toHaveAttribute('d', /^M.+L.+/);
        await expect(
            page.getByTestId(`lighting-bundle-trunk-${acBundle}`),
        ).toHaveCount(1);
        await expect(
            page.getByTestId(`lighting-bundle-trunk-${acBundle}`),
        ).toHaveAttribute('d', /^M.+L.+/);
        await expect(
            page.locator('path[data-testid^="lighting-external-cable-"]'),
        ).toHaveCount(8);

        await selectCablingObject(page, networkEntry);
        const entryHandle = page.getByTestId(
            `lighting-cable-entry-${networkEntry}`,
        );
        await dragCablingHandle(
            page,
            entryHandle,
            { x: 0, y: 35 },
            async () => {
                await expect(entryHandle).not.toHaveAttribute(
                    'data-y-mm',
                    '120',
                );
            },
        );
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).cable_entries.find(
                        (entry) => entry.portable_id === networkEntry,
                    )?.offset_mm,
            )
            .toBeGreaterThan(110);
        const movedEntry = await readLayout(page, designId);
        const networkOpening = movedEntry.cable_entries.find(
            (entry) => entry.portable_id === networkEntry,
        )!;
        const movedTrunk = movedEntry.cable_bundles.find(
            (bundle) => bundle.portable_id === networkBundle,
        )!;
        expect(networkOpening.side).toBe('left');
        expect(movedTrunk.route_points[0]).toEqual({
            x_mm: 0,
            y_mm: networkOpening.offset_mm + networkOpening.span_mm / 2,
        });
        const originalNetwork = defined.cable_bundles.find(
            (bundle) => bundle.portable_id === networkBundle,
        )!;
        expect(movedTrunk.route_points.at(-1)).toEqual(
            originalNetwork.route_points.at(-1),
        );
        const networkCable = movedEntry.external_cables.find(
            (cable) => cable.bundle_portable_id === networkBundle,
        )!;
        expect(networkCable.branch_route_points).toEqual(
            defined.external_cables.find(
                (cable) => cable.portable_id === networkCable.portable_id,
            )!.branch_route_points,
        );

        await selectCablingObject(page, networkBundle);
        const breakoutHandle = page.getByTestId(
            `lighting-bundle-breakout-${networkBundle}`,
        );
        const trunkPath = page.getByTestId(
            `lighting-bundle-trunk-${networkBundle}`,
        );
        const branchPath = page.locator(
            `path[data-testid="lighting-external-cable-${networkCable.portable_id}"]`,
        );
        const beforeBreakout = movedTrunk.route_points.at(-1)!;
        const beforeTrunkPath = await trunkPath.getAttribute('d');
        const beforeBranchPath = await branchPath.getAttribute('d');
        await dragCablingHandle(
            page,
            breakoutHandle,
            { x: 80, y: 40 },
            async () => {
                await expect(trunkPath).not.toHaveAttribute(
                    'd',
                    beforeTrunkPath!,
                );
                await expect(branchPath).not.toHaveAttribute(
                    'd',
                    beforeBranchPath!,
                );
            },
        );
        await expect
            .poll(async () => {
                const end = (await readLayout(page, designId)).cable_bundles
                    .find((bundle) => bundle.portable_id === networkBundle)
                    ?.route_points.at(-1);

                return Boolean(
                    end &&
                    end.x_mm > beforeBreakout.x_mm &&
                    end.y_mm > beforeBreakout.y_mm,
                );
            })
            .toBe(true);
        const movedBreakout = await readLayout(page, designId);
        const networkRoute = movedBreakout.cable_bundles.find(
            (bundle) => bundle.portable_id === networkBundle,
        )!.route_points;
        expect(networkRoute[0]).toEqual(movedTrunk.route_points[0]);
        const networkBranches = movedBreakout.external_cables.filter(
            (cable) => cable.bundle_portable_id === networkBundle,
        );
        expect(networkBranches).toHaveLength(1);

        for (const cable of networkBranches) {
            expect(cable.branch_route_points[0]).toEqual(networkRoute.at(-1));
            expect(cable.branch_route_points.at(-1)).toEqual(
                networkCable.branch_route_points.at(-1),
            );
        }

        const savedTrunkPath = await trunkPath.getAttribute('d');
        const savedBranchPath = await branchPath.getAttribute('d');
        await dragCablingHandle(
            page,
            breakoutHandle,
            { x: 40, y: 25 },
            async () => {
                await expect(trunkPath).not.toHaveAttribute(
                    'd',
                    savedTrunkPath!,
                );
                await expect(branchPath).not.toHaveAttribute(
                    'd',
                    savedBranchPath!,
                );
            },
            true,
        );
        await expect(trunkPath).toHaveAttribute('d', savedTrunkPath!);
        await expect(branchPath).toHaveAttribute('d', savedBranchPath!);
        expect(
            physicalExternalCabling(await readLayout(page, designId)),
        ).toEqual(physicalExternalCabling(movedBreakout));
        await page.screenshot({
            path: testInfo.outputPath('external-bundles-wiring.png'),
        });

        await page
            .getByRole('button', { name: 'Wiring layers', exact: true })
            .click();
        await page
            .getByRole('menuitemcheckbox', {
                name: 'External cabling',
                exact: true,
            })
            .click();
        await expect(
            page.getByTestId(`lighting-bundle-trunk-${acBundle}`),
        ).toHaveCount(0);
        await expect(
            page.locator('path[data-testid^="lighting-external-cable-"]'),
        ).toHaveCount(0);
        await expect(
            page.getByTestId(`lighting-cable-entry-${bottomEntry}`),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await page
            .getByRole('button', { name: 'Wiring layers', exact: true })
            .click();
        await page
            .getByRole('menuitemcheckbox', {
                name: 'External cabling',
                exact: true,
            })
            .click();
        await page.keyboard.press('Escape');
        await expect(
            page.locator('path[data-testid^="lighting-external-cable-"]'),
        ).toHaveCount(8);
        await page
            .getByRole('button', { name: 'Panel builder', exact: true })
            .click();

        await page
            .getByRole('button', { name: 'Add row', exact: true })
            .click();
        await expect
            .poll(async () => (await readLayout(page, designId)).rails.length)
            .toBe(3);
        const expanded = await readLayout(page, designId);
        expect(
            expanded.cable_bundles.find(
                (bundle) => bundle.portable_id === networkBundle,
            )!.route_points,
        ).toEqual(networkRoute);
        expect(expanded.design.height_mm).toBeGreaterThan(
            defined.design.height_mm,
        );
        const expandedAc = expanded.cable_bundles.find(
            (bundle) => bundle.portable_id === acBundle,
        )!;
        expect(expandedAc.route_points[0]).toEqual({
            x_mm: 30,
            y_mm: expanded.design.height_mm,
        });
        expect(
            expanded.cable_entries.find(
                (entry) => entry.portable_id === bottomEntry,
            )?.offset_mm,
        ).toBe(20);
        await expect(
            page.getByTestId(`lighting-cable-entry-${bottomEntry}`),
        ).toBeVisible();
        await page.screenshot({
            path: testInfo.outputPath('external-entry-grown-panel.png'),
        });

        await page.reload();
        await expect(
            page.getByTestId(`lighting-cable-entry-${bottomEntry}`),
        ).toBeVisible();
        const reloaded = await readLayout(page, designId);
        expect(physicalExternalCabling(reloaded)).toEqual(
            physicalExternalCabling(expanded),
        );
        const exported = await exportDesign(page);
        expect(exported.document.schema_version).toBe(1);
        expect(exported.document.cable_entries).toHaveLength(4);
        expect(exported.document.cable_bundles).toHaveLength(4);
        expect(exported.document.external_cables).toHaveLength(12);

        for (const cable of exported.document.external_cables) {
            expect(cable).not.toHaveProperty('internal_component_id');
            expect(cable).not.toHaveProperty('bundle_id');
        }

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
        await expect(dialog).toContainText('All resolved');
        await dialog
            .getByRole('button', { name: 'Import new design', exact: true })
            .click();
        await expect(page).toHaveURL(/\/designs\/\d+$/);
        const importedId = Number(
            new URL(page.url()).pathname.split('/').at(-1),
        );
        expect(importedId).not.toBe(designId);
        const imported = await readLayout(page, importedId);
        expect(physicalExternalCabling(imported)).toEqual(
            physicalExternalCabling(reloaded),
        );
        const oldIds = [
            ...reloaded.cable_entries,
            ...reloaded.cable_bundles,
            ...reloaded.external_cables,
        ].map((item) => item.portable_id);

        for (const item of [
            ...imported.cable_entries,
            ...imported.cable_bundles,
            ...imported.external_cables,
        ]) {
            expect(oldIds).not.toContain(item.portable_id);
        }

        await page.screenshot({
            path: testInfo.outputPath('external-cabling-imported-panel.png'),
        });
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('clears cabling selections on undo and redo and retains standalone cables when devices are deleted', async ({
    context,
    page,
}) => {
    test.setTimeout(90_000);
    const name = `Cabling lifecycle E2E ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const designId = await createDesign(page, name);
        const supplyId = await placeComponent(
            page,
            designId,
            'Generic 24V DIN power supply (sample)',
        );
        const entryId = await addCableEntry(
            page,
            designId,
            'Supply entry',
            'top',
            30,
        );
        await inspector(page)
            .getByRole('button', { name: 'Add standalone cable', exact: true })
            .click();
        await editCablingField(page, 'Cable label', 'Supply field cable');
        await inspector(page)
            .getByLabel('Cable class', { exact: true })
            .selectOption('line_voltage');
        await inspector(page)
            .getByLabel('Direction', { exact: true })
            .selectOption('incoming');
        await inspector(page)
            .getByLabel('Internal component', { exact: true })
            .selectOption(supplyId);
        await inspector(page)
            .getByLabel('Internal terminal', { exact: true })
            .selectOption('L');
        await expect
            .poll(
                async () => (await readLayout(page, designId)).external_cables,
            )
            .toEqual([
                expect.objectContaining({
                    label: 'Supply field cable',
                    bundle_portable_id: null,
                    cable_entry_portable_id: entryId,
                    cable_class: 'line_voltage',
                    direction: 'incoming',
                    internal_component_portable_id: supplyId,
                    internal_terminal: 'L',
                }),
            ]);
        const assigned = await readLayout(page, designId);
        const cableId = assigned.external_cables[0].portable_id;
        expect(assigned.cable_bundles).toHaveLength(0);
        expect(
            assigned.external_cables[0].branch_route_points.length,
        ).toBeGreaterThan(1);
        expect(assigned.external_cables[0].branch_route_points[0]).toEqual({
            x_mm: 40,
            y_mm: 0,
        });
        await expect(
            inspector(page).getByLabel('Cable origin', { exact: true }),
        ).toHaveValue(`entry:${entryId}`);

        await editCablingField(page, 'Cable label', 'Renamed field cable');
        await expect
            .poll(
                async () =>
                    (await readLayout(page, designId)).external_cables[0]
                        ?.label,
            )
            .toBe('Renamed field cable');

        async function expectUnselectedCableRetained(
            label: string,
        ): Promise<void> {
            await expect(inspector(page)).toBeHidden();
            await page.keyboard.press('Delete');
            const dialog = await openCablingDialog(page);
            await expect(
                dialog.getByTestId(`lighting-cabling-item-${cableId}`),
            ).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
            await expect
                .poll(
                    async () =>
                        (await readLayout(page, designId)).external_cables.find(
                            (cable) => cable.portable_id === cableId,
                        )?.label,
                )
                .toBe(label);
        }

        await page
            .getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })
            .click();
        await expectUnselectedCableRetained('Supply field cable');
        await selectCablingObject(page, cableId);
        await page
            .getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true })
            .click();
        await expectUnselectedCableRetained('Renamed field cable');

        await selectCablingObject(page, entryId);
        await expect(
            inspector(page).getByRole('button', {
                name: 'Delete entry',
                exact: true,
            }),
        ).toBeDisabled();
        await page.keyboard.press('Delete');
        await expect(
            page.getByTestId(`lighting-cable-entry-${entryId}`),
        ).toBeVisible();
        await componentNode(page, supplyId).click();
        await inspector(page)
            .getByRole('button', { name: 'Delete device', exact: true })
            .click();
        await expect
            .poll(
                async () => (await readLayout(page, designId)).external_cables,
            )
            .toEqual([
                expect.objectContaining({
                    portable_id: cableId,
                    label: 'Renamed field cable',
                    bundle_portable_id: null,
                    cable_entry_portable_id: entryId,
                    cable_class: 'line_voltage',
                    direction: 'incoming',
                    internal_component_portable_id: null,
                    internal_terminal: null,
                    branch_route_points: [],
                }),
            ]);
        expect((await readLayout(page, designId)).components).toHaveLength(0);
        await page.reload();
        await selectCablingObject(page, cableId);
        await expect(
            inspector(page).getByLabel('Internal component', { exact: true }),
        ).toHaveValue('');
        await expect(
            inspector(page).getByLabel('Cable origin', { exact: true }),
        ).toHaveValue(`entry:${entryId}`);
    } finally {
        await cleanupDesigns(page, name);
    }
});

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
        const addDeviceDialog = page.getByRole('dialog', {
            name: 'Add device',
            exact: true,
            includeHidden: true,
        });
        await expect(addDeviceDialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(addDeviceDialog).toHaveCount(0);
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

test('navigates connected terminals and chooses among internal and field connections', async ({
    context,
    page,
}) => {
    test.setTimeout(60_000);
    const name = `Lighting E2E terminal navigation ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const { layout } = await createWiringFixture(page, name);
        await test.info().attach('wiring-visual-layout', {
            body: JSON.stringify(layoutSnapshot(layout)),
            contentType: 'application/json',
        });
        await writeFile(
            test.info().outputPath('wiring-visual-layout.json'),
            JSON.stringify(layoutSnapshot(layout)),
        );
        await enterWiringView(page);
        const device = layout.components[0].portable_id;
        await componentNode(page, device).click();
        const spare = inspector(page).locator('[data-terminal-key="SW2"]');
        await expect(spare).toContainText('Not connected');
        await expect(spare).not.toHaveRole('button');
        await inspector(page).locator('button[data-terminal-key="O1"]').click();
        await expect(
            inspector(page).getByLabel('Cable label', { exact: true }),
        ).toHaveValue('Living ceiling');
        await expect(page.getByTestId('lighting-route-focus')).toHaveAttribute(
            'data-route-id',
            layout.external_cables[0].portable_id,
        );
        await expect(
            page.getByTestId('lighting-route-focus').locator('g'),
        ).toHaveCount(2);

        await componentNode(page, device).click();
        const neutralTerminal = inspector(page).locator(
            'button[data-terminal-key="N"]',
        );
        await neutralTerminal.focus();
        await neutralTerminal.press('Enter');
        const chooser = page.getByRole('dialog', { name: /2 connections/ });
        await expect(chooser.locator('[data-route-id]')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await expect(chooser).toBeHidden();
        await expect(neutralTerminal).toBeFocused();
        await neutralTerminal.press('Enter');
        await chooser
            .locator(`[data-route-id="${layout.connections[0].portable_id}"]`)
            .click();
        await expect(chooser).toBeHidden();
        await expect(
            inspector(page).getByLabel('Cable type', { exact: true }),
        ).toHaveValue('Neutral jumper');
        await expect(page.getByTestId('lighting-route-focus')).toHaveAttribute(
            'data-route-id',
            layout.connections[0].portable_id,
        );
        await componentNode(page, device).click({ modifiers: ['Shift'] });
        await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
        await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
        await inspector(page).locator('button[data-terminal-key="N"]').click();
        await chooser
            .locator(`[data-route-id="${layout.connections[0].portable_id}"]`)
            .click();
        await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
        await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
    } finally {
        await cleanupDesigns(page, name);
    }
});

test('selects every route at an overlap and exposes bundle member cables', async ({
    context,
    page,
}) => {
    test.setTimeout(60_000);
    const name = `Lighting E2E overlapping routes ${randomUUID()}`;
    await openLighting(context, page);

    try {
        const { layout } = await createWiringFixture(page, name);
        await enterWiringView(page);
        const overlapBadge = page
            .locator(
                '[data-testid="lighting-route-overlap"][data-route-count="3"]',
            )
            .first();
        await expect(overlapBadge).toBeVisible();
        await overlapBadge.focus();
        await overlapBadge.press('Enter');
        await expect(
            page.getByRole('dialog', { name: 'Choose a route' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(overlapBadge).toBeFocused();
        const candidates = [
            layout.connections[0].portable_id,
            ...layout.external_cables
                .slice(0, 2)
                .map((cable) => cable.portable_id),
        ];

        for (const id of candidates) {
            await clickWiringPoint(page, 180, 185);
            const chooser = page.getByRole('dialog', {
                name: 'Choose a route',
            });
            await expect(chooser.locator('[data-route-id]')).toHaveCount(3);

            for (const candidate of candidates) {
                await expect(
                    chooser.locator(`[data-route-id="${candidate}"]`),
                ).toBeVisible();
            }

            await chooser
                .locator('[data-route-id]')
                .last()
                .scrollIntoViewIfNeeded();
            await expect(
                chooser.getByRole('heading', { name: 'Choose a route' }),
            ).toBeInViewport();

            await chooser.locator(`[data-route-id="${id}"]`).click();
            await expect(chooser).toBeHidden();
            await expect(
                page.getByTestId('lighting-route-focus'),
            ).toHaveAttribute('data-route-id', id);
            await expect(inspector(page)).toBeVisible();
        }

        await clickWiringPoint(page, 70, 275);
        const trunkChooser = page.getByRole('dialog', {
            name: 'Choose a route',
        });
        await expect(trunkChooser.locator('[data-route-id]')).toHaveCount(4);
        await trunkChooser
            .locator(
                `[data-route-id="${layout.external_cables[2].portable_id}"]`,
            )
            .click();
        await expect(
            inspector(page).getByLabel('Cable label', { exact: true }),
        ).toHaveValue('Main bedroom – left keypad (unassigned)');
        await expect(page.getByTestId('lighting-route-focus')).toHaveAttribute(
            'data-route-id',
            layout.external_cables[2].portable_id,
        );
    } finally {
        await cleanupDesigns(page, name);
    }
});

unmonitoredTest(
    'downloads a vector wiring PDF from unsaved edits and reports preparation failures',
    async ({ context, page }) => {
        unmonitoredTest.setTimeout(60_000);
        const name = `Lighting E2E wiring PDF ${randomUUID()}`;
        await openLighting(context, page);
        let designId = 0;

        try {
            const fixture = await createWiringFixture(page, name);
            designId = fixture.designId;
            await componentNode(
                page,
                fixture.layout.components[0].portable_id,
            ).click();
            await page.route(`**/api/designs/${designId}/layout`, (route) =>
                route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Simulated save failure' }),
                }),
            );
            await inspector(page)
                .getByLabel('Custom label')
                .fill('Unsaved café lighting dimmer');
            await expect(page.getByRole('status')).toContainText('Save failed');
            const request = page.waitForRequest((request) =>
                request.url().endsWith(`/api/designs/${designId}/export`),
            );
            const downloading = page.waitForEvent('download');
            await page
                .getByRole('button', { name: 'Panel menu', exact: true })
                .click();
            await page
                .getByRole('menuitem', {
                    name: 'Export Wiring PDF',
                    exact: true,
                })
                .click();
            const exportRequest = await request;
            expect(
                exportRequest.postDataJSON().layout.components[0].custom_label,
            ).toBe('Unsaved café lighting dimmer');
            const download = await downloading;
            expect(download.suggestedFilename()).toMatch(/-wiring\.pdf$/);
            await download.saveAs(
                unmonitoredTest.info().outputPath('current-state-wiring.pdf'),
            );
            const path = await download.path();
            expect(path).not.toBeNull();
            const bytes = await readFile(path!);
            expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
            expect(bytes.length).toBeGreaterThan(10_000);
            expect(
                (await readLayout(page, designId)).components[0].custom_label,
            ).toBe('Living room dimmer');

            await page.route(`**/api/designs/${designId}/export`, (route) =>
                route.fulfill({
                    status: 422,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        message: 'Invalid current wiring snapshot',
                    }),
                }),
            );
            await page
                .getByRole('button', { name: 'Panel menu', exact: true })
                .click();
            await page
                .getByRole('menuitem', {
                    name: 'Export Wiring PDF',
                    exact: true,
                })
                .click();
            await expect(
                page
                    .getByRole('alert')
                    .filter({ hasText: 'Wiring PDF could not be exported' }),
            ).toContainText('Invalid current wiring snapshot');
            await page.unroute(`**/api/designs/${designId}/export`);
            await page.unroute(`**/api/designs/${designId}/layout`);
            await page
                .getByRole('button', { name: 'Retry', exact: true })
                .click();
            await expect(page.getByRole('status')).toContainText('Saved');
        } finally {
            if (designId) {
                await page.unroute(`**/api/designs/${designId}/export`);
                await page.unroute(`**/api/designs/${designId}/layout`);
            }

            await cleanupDesigns(page, name);
        }
    },
);
