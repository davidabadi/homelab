import assert from 'node:assert/strict';
import test from 'node:test';
import {
    dinPositionFits,
    firstDinPosition,
    freeDinGaps,
    nearestDinPosition,
    rowMmToPixels,
    rowPixelsToMm,
    snapDinPosition,
} from '../../resources/js/components/lighting/din-placement.ts';

const rail = { x_mm: 20, length_mm: 324 };

test('DIN collision checks allow touching edges and reject overlap and either rail boundary', () => {
    const occupied = [{ x_mm: 50, width_mm: 5.2 }];

    assert.equal(dinPositionFits(rail, 19, 31, occupied), true);
    assert.equal(dinPositionFits(rail, 19, 55.2, occupied), true);
    assert.equal(dinPositionFits(rail, 19, 55.19, occupied), false);
    assert.equal(dinPositionFits(rail, 19, 19.99, occupied), false);
    assert.equal(dinPositionFits(rail, 19, 325.01, occupied), false);
    assert.equal(dinPositionFits(rail, 19, 325, occupied), true);
    assert.equal(dinPositionFits(rail, 19, Number.NaN, occupied), false);
});

test('free gaps retain physical fractional widths and handle unsorted occupied intervals', () => {
    const gaps = freeDinGaps(rail, [
        { x_mm: 200, width_mm: 60.25 },
        { x_mm: 20, width_mm: 5.2 },
        { x_mm: 50, width_mm: 19 },
    ]);

    assert.deepEqual(gaps, [
        { start_mm: 25.2, end_mm: 50 },
        { start_mm: 69, end_mm: 200 },
        { start_mm: 260.25, end_mm: 344 },
    ]);
});

test('default placement skips small gaps and uses the first gap that actually fits', () => {
    const occupied = [
        { x_mm: 20, width_mm: 5.2 },
        { x_mm: 40, width_mm: 72 },
    ];

    assert.equal(firstDinPosition(rail, 19, occupied), 112);
    assert.equal(firstDinPosition(rail, 14.8, occupied), 25.2);
    assert.equal(firstDinPosition(rail, 233, occupied), null);
    assert.equal(firstDinPosition(rail, 0, occupied), null);
});

test('nearest placement preserves valid X and clamps to exact edges when a candidate collides or exceeds bounds', () => {
    const occupied = [{ x_mm: 90, width_mm: 60.25 }];

    assert.equal(nearestDinPosition(rail, 19, 220.75, occupied), 220.75);
    assert.equal(nearestDinPosition(rail, 19, 135, occupied), 150.25);
    assert.equal(nearestDinPosition(rail, 19, -10, occupied), 20);
    assert.equal(nearestDinPosition(rail, 19, 900, occupied), 325);
    assert.equal(nearestDinPosition(rail, 400, 100, occupied), null);
});

test('1mm snapping is relative to the row start and remains independent of DIN module widths', () => {
    assert.equal(snapDinPosition(44.69, 20.2), 44.2);
    assert.equal(snapDinPosition(44.71, 20.2), 45.2);
    assert.equal(snapDinPosition(22.6, 20), 23);
    assert.equal(snapDinPosition(18.6, 20), 19);
});

test('row pixel conversion preserves the panel coordinate at different scales and scroll offsets', () => {
    for (const scale of [1.25, 2.5, 4]) {
        assert.equal(rowMmToPixels(180.25, 20, scale), 160.25 * scale);
        assert.equal(rowPixelsToMm(160.25 * scale, 20, scale), 180.25);
        assert.equal(rowPixelsToMm(0, 20, scale), 20);
    }
});
