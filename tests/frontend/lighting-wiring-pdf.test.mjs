import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
    generateWiringPdf,
    placeDiagramLabel,
    printRouteSegments,
} from '../../resources/js/components/lighting/wiring-pdf.ts';
import { buildWiringReport } from '../../resources/js/components/lighting/wiring-report.ts';
import { wiringDocument } from './lighting-wiring-fixture.mjs';

async function loadFonts() {
    const buffers = await Promise.all(
        ['Regular', 'Bold'].map((weight) =>
            readFile(
                new URL(
                    `../../public/fonts/NotoSans-${weight}.ttf`,
                    import.meta.url,
                ),
            ),
        ),
    );
    const arrayBuffer = (buffer) =>
        buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        );

    return { regular: arrayBuffer(buffers[0]), bold: arrayBuffer(buffers[1]) };
}

test('downloads a named multi-page vector PDF with embedded Unicode fonts', async () => {
    const document = wiringDocument();

    const result = await generateWiringPdf(document, { loadFonts });

    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const source = Buffer.from(bytes).toString('latin1');
    assert.equal(result.filename, 'main-lighting-cafe-wiring.pdf');
    assert.equal(result.blob.type, 'application/pdf');
    assert.ok(source.startsWith('%PDF-'));
    assert.ok(result.blob.size > 20_000);
    assert.ok((source.match(/\/Type \/Page\b/g) ?? []).length >= 8);
    assert.ok(source.includes('/FontFile2'));
    assert.equal(source.includes('/Subtype /Image'), false);
});

test('separates printed overlapping spans without changing their physical route coordinates', () => {
    const report = buildWiringReport(wiringDocument());
    const original = structuredClone(report.layout.connections);

    const routes = printRouteSegments(report, 0.5);

    const wires = routes.filter((item) => item.route.kind === 'connection');
    const horizontal = wires.map((wire) =>
        wire.segments.find(
            (segment) =>
                segment.originalStart.y_mm === 165 &&
                segment.originalEnd.y_mm === 165,
        ),
    );
    assert.equal(
        new Set(horizontal.map((segment) => segment.start.y_mm)).size,
        3,
    );
    assert.deepEqual(report.layout.connections, original);
    assert.equal(horizontal[0].originalStart.y_mm, 165);
});

test('keeps a cropped-edge terminal label visible with a leader placement', () => {
    const bounds = { x: 14, y: 42, width: 392, height: 211 };
    const size = { width: 12, height: 3.2 };
    const anchor = { x: 20, y: 42 };

    const placement = placeDiagramLabel(bounds, [], size, anchor, [
        { x: 20, y: 39 },
    ]);

    assert.ok(placement);
    assert.ok(placement.x - size.width / 2 >= bounds.x);
    assert.ok(placement.y - size.height / 2 >= bounds.y);
    assert.ok(placement.x + size.width / 2 <= bounds.x + bounds.width);
    assert.ok(placement.y + size.height / 2 <= bounds.y + bounds.height);
});

test('finds free paper space after nearby route label positions are exhausted', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const occupied = [{ x: 10, y: 10, width: 80, height: 80 }];
    const size = { width: 8, height: 4 };

    const placement = placeDiagramLabel(bounds, occupied, size, {
        x: 50,
        y: 50,
    });

    assert.ok(placement);
    assert.ok(
        placement.x + size.width / 2 <= 10 ||
            placement.x - size.width / 2 >= 90 ||
            placement.y + size.height / 2 <= 10 ||
            placement.y - size.height / 2 >= 90,
    );
});

test('requests the annotation schedule instead of overwriting an occupied route label', () => {
    const bounds = { x: 0, y: 0, width: 40, height: 20 };

    const placement = placeDiagramLabel(
        bounds,
        [bounds],
        { width: 8, height: 4 },
        { x: 20, y: 10 },
        [{ x: 20, y: 10 }],
    );

    assert.equal(placement, null);
});

test('stops PDF generation when its font preparation fails', async () => {
    const document = wiringDocument();

    await assert.rejects(
        generateWiringPdf(document, {
            loadFonts: async () => {
                throw new Error('Font unavailable');
            },
        }),
        /Font unavailable/,
    );
});

test('reports a failed font response without generating a fallback document', async (context) => {
    context.mock.method(
        globalThis,
        'fetch',
        async () => new Response('', { status: 404 }),
    );

    await assert.rejects(
        generateWiringPdf(wiringDocument()),
        /font could not be loaded/,
    );
});

test('rejects an invalid font body even when the asset server responds successfully', async () => {
    const invalid = new TextEncoder().encode('<html>Not a font</html>').buffer;

    await assert.rejects(
        generateWiringPdf(wiringDocument(), {
            loadFonts: async () => ({ regular: invalid, bold: invalid }),
        }),
        /font asset is invalid/,
    );
});
