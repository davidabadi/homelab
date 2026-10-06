import type { jsPDF } from 'jspdf';
import type { autoTable as AutoTable, CellInput } from 'jspdf-autotable';
import { terminalPoint } from './geometry.ts';
import type { LightingInterchangeDocument } from './interchange';
import { findRouteOverlaps } from './route-overlap.ts';
import type { CableClass, MmPoint } from './types';
import type { ReportDiagramRoute, WiringReport } from './wiring-report';
import { buildWiringReport, reportDeviceBounds } from './wiring-report.ts';

type PdfFonts = { regular: ArrayBuffer; bold: ArrayBuffer };
type PdfOptions = { loadFonts?: () => Promise<PdfFonts> };
type Point = { x: number; y: number };
type View = { x: number; y: number; width: number; height: number };
type Diagram = { scale: number; left: number; top: number; view: View };
type LabelBox = { x: number; y: number; width: number; height: number };
type DiagramAnnotation = { reference: string; schedule: string };

const margin = 14;
const ink = '#1e293b';
const muted = '#58667a';
const accent = '#115e59';
const classes: Record<
    CableClass,
    { label: string; color: string; dash: number[] }
> = {
    line_voltage: { label: 'Line voltage', color: '#9a3412', dash: [] },
    low_voltage_control: {
        label: 'Low voltage control',
        color: '#0f766e',
        dash: [2.4, 1],
    },
    data: { label: 'Data', color: '#6d28d9', dash: [0.5, 1] },
    other: { label: 'Other', color: '#475569', dash: [2, 0.7, 0.4, 0.7] },
};

async function loadReportFonts(): Promise<PdfFonts> {
    const [regular, bold] = await Promise.all(
        ['Regular', 'Bold'].map(async (weight) => {
            const response = await fetch(`/fonts/NotoSans-${weight}.ttf`);

            if (!response.ok) {
                throw new Error(
                    'The wiring PDF font could not be loaded. Try exporting again.',
                );
            }

            return response.arrayBuffer();
        }),
    );

    return { regular, bold };
}

function fontBase64(contents: ArrayBuffer): string {
    if (
        contents.byteLength < 12 ||
        new DataView(contents).getUint32(0) !== 0x00010000
    ) {
        throw new Error(
            'The wiring PDF font asset is invalid. Reload the application and try again.',
        );
    }

    const bytes = new Uint8Array(contents);
    let binary = '';

    for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }

    return btoa(binary);
}

function words(value: string | null | undefined): string {
    return value ? value.replaceAll('_', ' ') : '-';
}

function meters(value: number | null): string {
    return value === null ? 'Not specified' : `${(value / 1000).toFixed(3)} m`;
}

function labelEndpoint(
    endpoint: { reference: string; terminal: string; label: string } | null,
): string {
    return endpoint
        ? `${endpoint.reference} ${endpoint.terminal}\n${endpoint.label}`
        : 'UNASSIGNED';
}

function mapPoint(point: MmPoint, diagram: Diagram): Point {
    return {
        x: diagram.left + (point.x_mm - diagram.view.x) * diagram.scale,
        y: diagram.top + (point.y_mm - diagram.view.y) * diagram.scale,
    };
}

function clippedSegment(start: MmPoint, end: MmPoint, view: View) {
    const horizontal = start.y_mm === end.y_mm;
    const low = horizontal ? view.x + 3 : view.y + 3;
    const high = low + (horizontal ? view.width : view.height) - 6;
    const coordinate = horizontal ? start.y_mm : start.x_mm;
    const crossLow = horizontal ? view.y : view.x;
    const crossHigh = crossLow + (horizontal ? view.height : view.width);
    const first = horizontal ? start.x_mm : start.y_mm;
    const last = horizontal ? end.x_mm : end.y_mm;

    if (
        coordinate < crossLow ||
        coordinate > crossHigh ||
        Math.max(first, last) < low ||
        Math.min(first, last) > high
    ) {
        return null;
    }

    const clamp = (value: number) => Math.max(low, Math.min(high, value));

    return {
        start: horizontal
            ? { ...start, x_mm: clamp(first) }
            : { ...start, y_mm: clamp(first) },
        end: horizontal
            ? { ...end, x_mm: clamp(last) }
            : { ...end, y_mm: clamp(last) },
    };
}

function intersectsLabel(box: LabelBox, existing: LabelBox): boolean {
    return (
        box.x < existing.x + existing.width + 0.4 &&
        box.x + box.width + 0.4 > existing.x &&
        box.y < existing.y + existing.height + 0.4 &&
        box.y + box.height + 0.4 > existing.y
    );
}

/** Finds a visible, collision-free label position, including a leader in open paper space. */
export function placeDiagramLabel(
    bounds: LabelBox,
    occupied: LabelBox[],
    size: { width: number; height: number },
    anchor: Point,
    preferred: Point[] = [],
): Point | null {
    const fits = (point: Point) => {
        const box = {
            x: point.x - size.width / 2,
            y: point.y - size.height / 2,
            ...size,
        };

        return (
            box.x >= bounds.x &&
            box.y >= bounds.y &&
            box.x + box.width <= bounds.x + bounds.width &&
            box.y + box.height <= bounds.y + bounds.height &&
            !occupied.some((existing) => intersectsLabel(box, existing))
        );
    };

    for (const candidate of preferred) {
        if (fits(candidate)) {
            return candidate;
        }
    }

    for (let distance = 5; distance <= 30; distance += 5) {
        for (const [dx, dy] of [
            [0, -distance],
            [0, distance],
            [-distance, 0],
            [distance, 0],
        ]) {
            const candidate = { x: anchor.x + dx, y: anchor.y + dy };

            if (fits(candidate)) {
                return candidate;
            }
        }
    }

    let nearest: Point | null = null;
    let nearestDistance = Infinity;

    for (
        let y = bounds.y + size.height / 2;
        y <= bounds.y + bounds.height - size.height / 2;
        y += size.height + 1
    ) {
        for (
            let x = bounds.x + size.width / 2;
            x <= bounds.x + bounds.width - size.width / 2;
            x += Math.max(4, size.width / 2)
        ) {
            const candidate = { x, y };
            const distance = Math.hypot(x - anchor.x, y - anchor.y);

            if (distance < nearestDistance && fits(candidate)) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
    }

    return nearest;
}

/** Offsets only the printed shared spans; physical coordinates remain untouched. */
export function printRouteSegments(report: WiringReport, scale: number) {
    const overlaps = findRouteOverlaps(
        report.diagramRoutes.map((route) => ({
            selection: { type: route.kind, id: route.reference },
            paths: [route.points],
            countable: true,
        })),
    );

    return report.diagramRoutes.map((route) => ({
        route,
        segments: route.points.slice(1).flatMap((end, index) => {
            const start = route.points[index];
            const horizontal = start.y_mm === end.y_mm;
            const position = (point: MmPoint) =>
                horizontal ? point.x_mm : point.y_mm;
            const from = Math.min(position(start), position(end));
            const to = Math.max(position(start), position(end));
            const shared = overlaps.filter(
                (overlap) =>
                    overlap.selections.some(
                        (item) => item.id === route.reference,
                    ) &&
                    (horizontal
                        ? overlap.start.y_mm === start.y_mm &&
                          overlap.end.y_mm === start.y_mm
                        : overlap.start.x_mm === start.x_mm &&
                          overlap.end.x_mm === start.x_mm) &&
                    position(overlap.start) < to &&
                    position(overlap.end) > from,
            );
            const stops = [
                ...new Set([
                    from,
                    to,
                    ...shared.flatMap((overlap) => [
                        Math.max(from, position(overlap.start)),
                        Math.min(to, position(overlap.end)),
                    ]),
                ]),
            ].sort((a, b) => a - b);

            if (position(start) > position(end)) {
                stops.reverse();
            }

            return stops.slice(1).map((last, part) => {
                const first = stops[part];
                const midpoint = (first + last) / 2;
                const overlap = shared.find(
                    (item) =>
                        position(item.start) < midpoint &&
                        position(item.end) > midpoint,
                );
                const lane = overlap
                    ? overlap.selections.findIndex(
                          (item) => item.id === route.reference,
                      ) -
                      (overlap.selections.length - 1) / 2
                    : 0;
                const offset = (lane * 3.2) / scale;
                const firstPoint = horizontal
                    ? { x_mm: first, y_mm: start.y_mm }
                    : { x_mm: start.x_mm, y_mm: first };
                const lastPoint = horizontal
                    ? { x_mm: last, y_mm: start.y_mm }
                    : { x_mm: start.x_mm, y_mm: last };

                return {
                    originalStart: firstPoint,
                    originalEnd: lastPoint,
                    start: horizontal
                        ? { ...firstPoint, y_mm: firstPoint.y_mm + offset }
                        : { ...firstPoint, x_mm: firstPoint.x_mm + offset },
                    end: horizontal
                        ? { ...lastPoint, y_mm: lastPoint.y_mm + offset }
                        : { ...lastPoint, x_mm: lastPoint.x_mm + offset },
                };
            });
        }),
    }));
}

function diagramViews(report: WiringReport): View[] {
    const width = report.layout.design.width_mm;
    const height = report.layout.design.height_mm;
    const overview = { x: -12, y: -12, width: width + 24, height: height + 24 };
    const scale = Math.min(392 / overview.width, 210 / overview.height);
    const crowdedTerminals = report.devices.some(
        (device) => device.definition.terminals.length > 8,
    );

    if (scale >= 0.6 && !crowdedTerminals) {
        return [overview];
    }

    const tiles: View[] = [];
    const tileWidth = Math.min(width + 24, 480);
    const tileHeight = Math.min(height + 24, 250);
    const columns = Math.ceil((width + 24) / tileWidth);
    const rows = Math.ceil((height + 24) / tileHeight);

    if (columns * rows > 36) {
        return [overview];
    }

    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            tiles.push({
                x: -12 + (column * (width + 24)) / columns,
                y: -12 + (row * (height + 24)) / rows,
                width: (width + 24) / columns,
                height: (height + 24) / rows,
            });
        }
    }

    return [overview, ...tiles];
}

function drawDiagram(
    pdf: jsPDF,
    report: WiringReport,
    view: View,
    wiring: boolean,
    detail: boolean,
): DiagramAnnotation[] {
    const availableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const availableHeight = 211;
    const scale = Math.min(
        availableWidth / view.width,
        availableHeight / view.height,
    );
    const diagram: Diagram = {
        view,
        scale,
        left: margin + (availableWidth - view.width * scale) / 2,
        top: 43,
    };
    const design = report.layout.design;
    const annotations: DiagramAnnotation[] = [];
    const labelBounds = {
        x: margin + 0.4,
        y: 42,
        width: availableWidth - 0.8,
        height: 211,
    };
    const origin = mapPoint({ x_mm: 0, y_mm: 0 }, diagram);
    pdf.saveGraphicsState();
    pdf.rect(margin, 41, availableWidth, availableHeight + 3, null);
    pdf.clip();
    pdf.discardPath();
    pdf.setFillColor('#ffffff');
    pdf.setDrawColor('#94a3b8');
    pdf.setLineWidth(0.35);
    pdf.rect(
        origin.x,
        origin.y,
        design.width_mm * scale,
        design.height_mm * scale,
        'FD',
    );

    for (const duct of report.layout.ducts) {
        const point = mapPoint(duct, diagram);
        const width =
            (duct.orientation === 'horizontal'
                ? duct.length_mm
                : duct.width_mm) * scale;
        const height =
            (duct.orientation === 'horizontal'
                ? duct.width_mm
                : duct.length_mm) * scale;
        pdf.setFillColor('#f1f5f9');
        pdf.setDrawColor('#cbd5e1');
        pdf.rect(point.x, point.y, width, height, 'FD');
    }

    for (const row of report.rows) {
        const point = mapPoint(row.rail, diagram);
        pdf.setFillColor('#e2e8f0');
        pdf.setDrawColor('#a8b4c4');
        pdf.rect(
            point.x,
            point.y,
            row.rail.length_mm * scale,
            row.rail.width_mm * scale,
            'FD',
        );
        pdf.setTextColor(muted);
        pdf.setFontSize(8.5);
        pdf.text(
            row.reference,
            point.x + 1.5,
            point.y + row.rail.width_mm * scale - 1.8,
        );
    }

    const deviceLabels: {
        reference: string;
        label: string[];
        x: number;
        y: number;
        width: number;
        fontSize: number;
        vertical: boolean;
        box: LabelBox;
    }[] = [];

    for (const device of report.devices) {
        const bounds = reportDeviceBounds(device);
        const point = mapPoint(bounds, diagram);
        const width = bounds.width * scale;
        const height = bounds.height * scale;
        const visibleTop = Math.max(point.y, diagram.top);
        const visibleBottom = Math.min(
            point.y + height,
            diagram.top + view.height * scale,
        );
        const visibleLeft = Math.max(point.x, diagram.left);
        const visibleRight = Math.min(
            point.x + width,
            diagram.left + view.width * scale,
        );

        if (visibleBottom <= visibleTop || visibleRight <= visibleLeft) {
            continue;
        }

        const labelX = (visibleLeft + visibleRight) / 2;
        const labelY = (visibleTop + visibleBottom) / 2;
        pdf.setFillColor('#f8fafc');
        pdf.setDrawColor('#64748b');
        pdf.setLineWidth(0.3);
        pdf.rect(point.x, point.y, width, height, 'FD');
        let lines: string[] = [];
        const visibleWidth = visibleRight - visibleLeft;
        const captionWidth = Math.min(visibleWidth - 4, 36);
        const fontSize = visibleWidth < 14 ? 9 : 10;
        pdf.setFont('NotoSans', 'bold');
        pdf.setFontSize(fontSize);
        const referenceWidth = pdf.getTextWidth(device.reference);
        const vertical = visibleWidth < 14 || referenceWidth + 2 > visibleWidth;

        if (
            visibleRight - visibleLeft > 24 &&
            visibleBottom - visibleTop > 16
        ) {
            pdf.setFont('NotoSans', 'normal');
            pdf.setFontSize(8.5);
            const label =
                device.component.custom_label || device.definition.display_name;
            lines = (
                pdf.splitTextToSize(label, captionWidth) as string[]
            ).slice(0, 2);
        }

        const captionTextWidth = Math.max(
            0,
            ...lines.map((line) => pdf.getTextWidth(line)),
        );
        const box = vertical
            ? {
                  x: labelX - 2,
                  y: labelY - (referenceWidth + 2) / 2,
                  width: 4,
                  height: referenceWidth + 2,
              }
            : {
                  x:
                      labelX -
                      (Math.max(referenceWidth, captionTextWidth) + 2) / 2,
                  y: labelY - 4,
                  width: Math.max(referenceWidth, captionTextWidth) + 2,
                  height: 7 + lines.length * 3,
              };

        deviceLabels.push({
            reference: device.reference,
            label: lines,
            x: labelX,
            y: labelY,
            width,
            fontSize,
            vertical,
            box,
        });
    }

    if (wiring) {
        const routes = printRouteSegments(report, scale);

        const labels: LabelBox[] = deviceLabels.map((label) => label.box);

        for (const { route, segments } of routes) {
            const style = route.cableClass
                ? classes[route.cableClass]
                : { color: ink, dash: [] };
            pdf.setDrawColor(style.color);
            pdf.setLineWidth(route.kind === 'cable_bundle' ? 0.8 : 0.35);
            pdf.setLineDashPattern(style.dash, 0);

            for (const segment of segments) {
                const points = [
                    segment.originalStart,
                    segment.start,
                    segment.end,
                    segment.originalEnd,
                ].map((point) => mapPoint(point, diagram));

                for (let index = 1; index < points.length; index++) {
                    pdf.line(
                        points[index - 1].x,
                        points[index - 1].y,
                        points[index].x,
                        points[index].y,
                    );
                }
            }
        }

        pdf.setLineDashPattern([], 0);

        for (const { route, segments } of routes) {
            const visible = segments
                .flatMap((segment) => {
                    const clipped = clippedSegment(
                        segment.start,
                        segment.end,
                        view,
                    );

                    return clipped ? [clipped] : [];
                })
                .sort(
                    (a, b) =>
                        Math.hypot(
                            b.end.x_mm - b.start.x_mm,
                            b.end.y_mm - b.start.y_mm,
                        ) -
                        Math.hypot(
                            a.end.x_mm - a.start.x_mm,
                            a.end.y_mm - a.start.y_mm,
                        ),
                );
            pdf.setFont('NotoSans', 'bold');
            pdf.setFontSize(8.5);
            const width = pdf.getTextWidth(route.reference) + 2;

            if (!visible.length) {
                continue;
            }

            const preferred = visible.flatMap((segment) =>
                [0.5, 0.3, 0.7, 0.15, 0.85].map((fraction) =>
                    mapPoint(
                        {
                            x_mm:
                                segment.start.x_mm +
                                (segment.end.x_mm - segment.start.x_mm) *
                                    fraction,
                            y_mm:
                                segment.start.y_mm +
                                (segment.end.y_mm - segment.start.y_mm) *
                                    fraction,
                        },
                        diagram,
                    ),
                ),
            );
            const anchor = preferred[0];
            const placement = placeDiagramLabel(
                labelBounds,
                labels,
                { width, height: 3.8 },
                anchor,
                preferred,
            );

            if (placement) {
                labels.push({
                    x: placement.x - width / 2,
                    y: placement.y - 1.9,
                    width,
                    height: 3.8,
                });

                if (!preferred.includes(placement)) {
                    pdf.setDrawColor('#94a3b8');
                    pdf.setLineWidth(0.15);
                    pdf.line(anchor.x, anchor.y, placement.x, placement.y);
                }

                routeLabel(pdf, route, placement);
            } else {
                annotations.push({
                    reference: route.reference,
                    schedule:
                        route.kind === 'connection'
                            ? 'Internal connection schedule'
                            : route.kind === 'external_cable'
                              ? 'External cable schedule'
                              : 'Cable entries and bundles',
                });
            }
        }

        for (const device of report.devices) {
            for (const terminal of device.definition.terminals) {
                const physicalPoint = terminalPoint(
                    device.component,
                    device.definition,
                    terminal,
                );

                if (
                    physicalPoint.x_mm < view.x ||
                    physicalPoint.x_mm > view.x + view.width ||
                    physicalPoint.y_mm < view.y ||
                    physicalPoint.y_mm > view.y + view.height
                ) {
                    continue;
                }

                const point = mapPoint(physicalPoint, diagram);
                pdf.setFillColor('#ffffff');
                pdf.setDrawColor('#334155');
                pdf.circle(point.x, point.y, 0.7, 'FD');

                if (
                    detail ||
                    (scale >= 0.6 && device.definition.terminals.length <= 8)
                ) {
                    pdf.setFont('NotoSans', 'normal');
                    pdf.setFontSize(8);
                    pdf.setTextColor(ink);
                    const bounds = reportDeviceBounds(device);
                    const topLeft = mapPoint(bounds, diagram);
                    const sides = [
                        {
                            side: 'top',
                            distance: Math.abs(point.y - topLeft.y),
                        },
                        {
                            side: 'bottom',
                            distance: Math.abs(
                                point.y - topLeft.y - bounds.height * scale,
                            ),
                        },
                        {
                            side: 'left',
                            distance: Math.abs(point.x - topLeft.x),
                        },
                        {
                            side: 'right',
                            distance: Math.abs(
                                point.x - topLeft.x - bounds.width * scale,
                            ),
                        },
                    ].sort((a, b) => a.distance - b.distance);
                    const side = sides[0].side;
                    const width = pdf.getTextWidth(terminal.key) + 1;
                    const preferred: Point[] = [];

                    for (let lane = 0; lane < 8; lane++) {
                        const candidate =
                            side === 'top'
                                ? { x: point.x, y: point.y - 2 - lane * 3.5 }
                                : side === 'bottom'
                                  ? { x: point.x, y: point.y + 4 + lane * 3.5 }
                                  : side === 'left'
                                    ? {
                                          x: point.x - width / 2 - 2 - lane * 5,
                                          y: point.y + 1,
                                      }
                                    : {
                                          x: point.x + width / 2 + 2 + lane * 5,
                                          y: point.y + 1,
                                      };
                        preferred.push({
                            x: candidate.x,
                            y: candidate.y - 0.9,
                        });
                    }

                    const placement = placeDiagramLabel(
                        labelBounds,
                        labels,
                        { width, height: 3.2 },
                        point,
                        preferred,
                    );

                    if (placement) {
                        const label = { x: placement.x, y: placement.y + 0.9 };
                        labels.push({
                            x: placement.x - width / 2,
                            y: placement.y - 1.6,
                            width,
                            height: 3.2,
                        });
                        pdf.setDrawColor('#94a3b8');
                        pdf.setLineWidth(0.15);
                        pdf.line(point.x, point.y, label.x, label.y - 0.8);
                        pdf.setFillColor('#ffffff');
                        pdf.rect(
                            label.x - width / 2,
                            label.y - 2.5,
                            width,
                            3.2,
                            'F',
                        );
                        pdf.text(terminal.key, label.x, label.y, {
                            align: 'center',
                        });
                    } else {
                        annotations.push({
                            reference: `${device.reference} ${terminal.key}`,
                            schedule: 'Terminal connection schedule',
                        });
                    }
                }
            }
        }
    }

    pdf.setLineDashPattern([], 0);

    for (const entry of report.entries) {
        const point = mapPoint(entry.point, diagram);
        pdf.setFillColor('#ffffff');
        pdf.setDrawColor(accent);
        pdf.setLineWidth(0.5);
        pdf.circle(point.x, point.y, 1.5, 'FD');
        pdf.setTextColor(accent);
        pdf.setFontSize(9);
        const offset = entry.entry.side === 'bottom' ? 5 : -3;
        pdf.text(entry.reference, point.x + 2, point.y + offset);
    }

    for (const label of deviceLabels) {
        pdf.setFont('NotoSans', 'bold');
        pdf.setFontSize(label.fontSize);

        if (label.vertical) {
            pdf.setFillColor('#f8fafc');
            pdf.rect(
                label.box.x,
                label.box.y,
                label.box.width,
                label.box.height,
                'F',
            );
            pdf.setTextColor(ink);
            pdf.text(label.reference, label.x + 1, label.y, {
                align: 'center',
                angle: 90,
            });

            continue;
        }

        pdf.setFillColor('#f8fafc');
        pdf.rect(
            label.box.x,
            label.box.y,
            label.box.width,
            label.box.height,
            'F',
        );
        pdf.setTextColor(ink);
        pdf.text(label.reference, label.x, label.y - 1, { align: 'center' });
        pdf.setFont('NotoSans', 'normal');
        pdf.setFontSize(8.5);

        if (label.label.length) {
            pdf.text(label.label, label.x, label.y + 3.5, { align: 'center' });
        }
    }

    pdf.restoreGraphicsState();
    pdf.setFont('NotoSans', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(muted);

    if (annotations.length) {
        pdf.text(
            `${annotations.length} crowded label(s) listed by reference in the Diagram annotation schedule.`,
            margin,
            33,
        );
    }

    pdf.text(
        `Enclosure ${design.width_mm} x ${design.height_mm} mm${design.depth_mm ? `; depth ${design.depth_mm} mm` : ''}. View x ${Math.max(0, view.x).toFixed(0)}-${Math.min(design.width_mm, view.x + view.width).toFixed(0)} mm, y ${Math.max(0, view.y).toFixed(0)}-${Math.min(design.height_mm, view.y + view.height).toFixed(0)} mm.`,
        margin,
        261,
    );

    if (wiring) {
        let x = margin;
        const legend = [
            { label: 'Internal wire', color: ink, dash: [] },
            ...Object.values(classes),
        ];

        for (const style of legend) {
            pdf.setDrawColor(style.color);
            pdf.setLineDashPattern(style.dash, 0);
            pdf.setLineWidth(0.4);
            pdf.line(x, 269, x + 10, 269);
            pdf.setTextColor(ink);
            pdf.setFontSize(9);
            pdf.text(style.label, x + 13, 270);
            x += 77;
        }

        pdf.setLineDashPattern([], 0);
    }

    return annotations;
}

function routeLabel(
    pdf: jsPDF,
    route: ReportDiagramRoute,
    middle: Point,
): void {
    pdf.setFont('NotoSans', 'bold');
    pdf.setFontSize(8.5);
    const width = pdf.getTextWidth(route.reference) + 2;
    pdf.setFillColor('#ffffff');
    pdf.rect(middle.x - width / 2, middle.y - 1.9, width, 3.8, 'F');
    pdf.setTextColor(route.cableClass ? classes[route.cableClass].color : ink);
    pdf.text(route.reference, middle.x, middle.y + 1, { align: 'center' });
    pdf.setFont('NotoSans', 'normal');
}

/** Generates a vector PDF from the server-validated current design snapshot. */
export async function generateWiringPdf(
    document: LightingInterchangeDocument,
    options: PdfOptions = {},
): Promise<{ blob: Blob; filename: string }> {
    const report = buildWiringReport(document);
    const [{ jsPDF: Pdf }, { autoTable }, fonts] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        (options.loadFonts ?? loadReportFonts)(),
    ]);
    const pdf = new Pdf({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a3',
        compress: true,
        putOnlyUsedFonts: true,
    });
    pdf.addFileToVFS('NotoSans-Regular.ttf', fontBase64(fonts.regular));
    pdf.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
    pdf.addFileToVFS('NotoSans-Bold.ttf', fontBase64(fonts.bold));
    pdf.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
    pdf.setFont('NotoSans', 'normal');
    pdf.setProperties({
        title: `${report.name} - Wiring package`,
        subject: 'Panel layout, wiring and field cable schedules',
        creator: 'Homelab lighting panel designer',
    });
    let firstPage = true;
    const section = (title: string, subtitle: string): void => {
        if (!firstPage) {
            pdf.addPage('a3', 'landscape');
        }

        firstPage = false;
        sectionTitle = title;
        pdf.setFont('NotoSans', 'bold');
        pdf.setFontSize(20);
        pdf.setTextColor(ink);
        pdf.text(title, margin, 17);
        pdf.setFont('NotoSans', 'normal');
        pdf.setFontSize(10.5);
        pdf.setTextColor(muted);
        pdf.text(pdf.splitTextToSize(subtitle, 390) as string[], margin, 25);
    };
    let sectionTitle = '';
    const table = (
        head: string[],
        body: CellInput[][],
        columnWidths?: number[],
        startY = 35,
    ): number => {
        return drawTable(
            pdf,
            autoTable,
            head,
            body,
            columnWidths,
            sectionTitle,
            startY,
        );
    };
    const subsection = (title: string, afterY: number): number => {
        if (afterY + 32 > pdf.internal.pageSize.getHeight() - 20) {
            section(
                title,
                'Continued assembly schedule. References match the panel and wiring diagrams.',
            );

            return 35;
        }

        pdf.setFont('NotoSans', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(ink);
        pdf.text(title, margin, afterY + 11);
        pdf.setFont('NotoSans', 'normal');

        return afterY + 17;
    };

    section(
        'Wiring package',
        'Panel assembly, terminal connections and field cable reference',
    );
    pdf.setFont('NotoSans', 'bold');
    pdf.setFontSize(27);
    pdf.setTextColor(accent);
    const nameLines = pdf.splitTextToSize(report.name, 380) as string[];
    pdf.text(nameLines, margin, 45);
    const titleBottom = 46 + nameLines.length * 11;
    pdf.setFont('NotoSans', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(muted);
    pdf.text(
        `Current design snapshot generated ${new Date(report.generatedAt).toLocaleString()}`,
        margin,
        titleBottom,
    );
    autoTable(pdf, {
        startY: titleBottom + 9,
        margin: { left: margin, right: margin, top: 34, bottom: 20 },
        theme: 'grid',
        styles: {
            font: 'NotoSans',
            fontSize: 12,
            cellPadding: 5,
            textColor: ink,
            lineColor: '#dbe3ec',
            lineWidth: 0.2,
        },
        headStyles: {
            fillColor: accent,
            textColor: '#ffffff',
            fontStyle: 'bold',
        },
        head: [
            [
                'Devices',
                'Internal wires',
                'Field cables',
                'Bundles',
                'Cable entries',
            ],
        ],
        body: [
            [
                report.devices.length,
                report.wires.length,
                report.externalCables.length,
                report.bundles.length,
                report.entries.length,
            ],
        ],
    });
    const contentY = Math.max(titleBottom + 49, 116);
    pdf.setFontSize(12);
    pdf.setFont('NotoSans', 'bold');
    pdf.setTextColor(ink);
    pdf.text('Assembly and wiring reference', margin, contentY);
    pdf.setFont('NotoSans', 'normal');
    pdf.setFontSize(11);
    pdf.text(
        [
            'Physical panel layout and separate vector wiring diagrams',
            'Device, internal wire, external cable, entry and bundle schedules',
            'Terminal-by-terminal connections and spare terminal inventory',
            'Cable quantities and panel-internal routed length summary',
        ],
        margin,
        contentY + 9,
        { lineHeightFactor: 1.8 },
    );
    pdf.setFont('NotoSans', 'bold');
    pdf.text('Assignment review', 230, contentY);
    pdf.setFont('NotoSans', 'normal');
    pdf.text(
        [
            `${report.incomplete.unassignedCables} unassigned field cable(s)`,
            `${report.incomplete.spareTerminals} spare / unconnected terminal(s)`,
            `${report.incomplete.plannedCablesMissing} planned bundle cable(s) not yet defined`,
        ],
        230,
        contentY + 9,
        { lineHeightFactor: 1.8 },
    );
    pdf.setTextColor(muted);
    pdf.setFontSize(10.5);
    pdf.text(
        pdf.splitTextToSize(
            'Installing electrician must verify the design, conductor sizing, protection and installation against applicable electrical codes. Route lengths describe only the panel portion, excluding building runs, slack and service loops.',
            382,
        ) as string[],
        margin,
        contentY + 59,
    );

    if (report.layout.design.notes) {
        const notesY = contentY + 82;
        const noteLines = pdf.splitTextToSize(
            report.layout.design.notes,
            382,
        ) as string[];

        if (notesY + 8 + noteLines.length * 4.5 < 277) {
            pdf.setTextColor(ink);
            pdf.setFont('NotoSans', 'bold');
            pdf.text('Project notes', margin, notesY);
            pdf.setFont('NotoSans', 'normal');
            pdf.text(noteLines, margin, notesY + 7);
        } else {
            section(
                'Project notes',
                'Design notes captured with this wiring package',
            );
            table(['Design notes'], [[report.layout.design.notes]]);
        }
    }

    section(
        'Panel layout',
        'Physical device placement, DIN rows and cable entries. Device references match every schedule.',
    );
    const views = diagramViews(report);
    drawDiagram(pdf, report, views[0], false, false);
    const diagramAnnotations: (DiagramAnnotation & { diagram: string })[] = [];

    for (let index = 0; index < views.length; index++) {
        const detail = index > 0;
        const diagramTitle = detail
            ? `Wiring detail ${index} of ${views.length - 1}`
            : 'Wiring diagram';
        section(
            diagramTitle,
            detail
                ? 'Cropped detail of the overview. Route IDs continue across adjoining views; schedules provide complete endpoint and cable information.'
                : 'Parallel lanes separate shared route spans for printed clarity. BND references identify shared trunks; EXT references identify their cable branches.',
        );
        diagramAnnotations.push(
            ...drawDiagram(pdf, report, views[index], true, detail).map(
                (annotation) => ({ ...annotation, diagram: diagramTitle }),
            ),
        );
    }

    if (diagramAnnotations.length) {
        section(
            'Diagram annotation schedule',
            'References retained where diagram space cannot fit a readable label. Complete route endpoints and terminal assignments appear in the named schedule.',
        );
        table(
            ['Diagram', 'Reference', 'Complete connection information'],
            diagramAnnotations.map((annotation) => [
                annotation.diagram,
                annotation.reference,
                annotation.schedule,
            ]),
        );
    }

    section(
        'Internal connection schedule',
        'Panel route is the physical polyline estimate before slack or service loops. Actual length is shown separately when recorded.',
    );
    table(
        [
            'Wire',
            'From device / terminal',
            'To device / terminal',
            'Type',
            'Gauge',
            'Cores',
            'Color',
            'Panel route',
            'Actual length',
            'Notes',
        ],
        report.wires.map((wire) => [
            wire.reference,
            labelEndpoint(wire.from),
            labelEndpoint(wire.to),
            wire.connection.cable_type,
            wire.connection.gauge ?? '-',
            wire.connection.conductor_count,
            wire.connection.color ?? '-',
            meters(wire.panelLengthMm),
            meters(wire.connection.actual_length_mm),
            wire.connection.notes ?? '-',
        ]),
        [20, 52, 52, 37, 23, 15, 25, 26, 28, 114],
    );

    section(
        'External cable schedule',
        "Panel route includes each cable's shared trunk and branch. Building-run lengths are not specified. UNASSIGNED cables remain in this schedule.",
    );
    table(
        [
            'Cable / label',
            'Entry / bundle',
            'Location / class / direction',
            'Type / gauge / cores',
            'Internal termination',
            'Panel route',
            'Status',
            'Notes',
        ],
        report.externalCables.map((cable) => [
            `${cable.reference}\n${cable.cable.label}`,
            `${cable.entryReference}\n${cable.bundleReference ?? 'Direct entry'}`,
            `${cable.externalLocation ?? 'Location not specified'}\n${classes[cable.cableClass].label}\n${words(cable.direction)}`,
            `${cable.cable.cable_type}\n${cable.cable.gauge ?? 'Gauge not specified'}\n${cable.cable.conductor_count} conductor(s)`,
            labelEndpoint(cable.termination),
            meters(cable.panelLengthMm),
            cable.termination ? 'ASSIGNED' : 'UNASSIGNED',
            cable.cable.notes ?? '-',
        ]),
        [58, 34, 67, 51, 55, 28, 30, 69],
    );

    section(
        'Cable entries and bundles',
        'Offsets locate the beginning of the entry span along its enclosure side; dimensions are in millimetres.',
    );
    const entriesBottom = table(
        ['Entry', 'Name', 'Side', 'Offset', 'Span', 'Type', 'Notes'],
        report.entries.map((entry) => [
            entry.reference,
            entry.entry.label,
            words(entry.entry.side),
            `${entry.entry.offset_mm} mm`,
            `${entry.entry.span_mm} mm`,
            words(entry.entry.entry_type),
            entry.entry.notes ?? '-',
        ]),
    );
    const bundleY = subsection(
        'Cable bundles - planned, defined and unassigned counts',
        entriesBottom,
    );
    table(
        [
            'Bundle / name',
            'Entry',
            'Class / direction',
            'External location',
            'Planned',
            'Defined',
            'Unassigned',
            'Outstanding',
            'Notes',
        ],
        report.bundles.map((bundle) => [
            `${bundle.reference}\n${bundle.bundle.name}`,
            bundle.entryReference,
            `${classes[bundle.bundle.cable_class].label}\n${words(bundle.bundle.direction)}`,
            bundle.bundle.external_location ?? '-',
            bundle.bundle.planned_count ?? 'Not specified',
            bundle.definedCount,
            bundle.unassignedCount,
            bundle.missingPlannedCount,
            bundle.bundle.notes ?? '-',
        ]),
        undefined,
        bundleY,
    );

    section(
        'Component schedule',
        'Physical positions are enclosure coordinates in millimetres. DIN modules are shown only when defined by the catalog.',
    );
    const componentBottom = table(
        [
            'Reference',
            'Custom label',
            'Manufacturer / model',
            'Category',
            'DIN row',
            'Position',
            'Width / modules',
            'Notes',
        ],
        report.devices.map((device) => [
            device.reference,
            device.component.custom_label ?? '-',
            `${device.definition.manufacturer}\n${device.definition.model}`,
            words(device.definition.category),
            device.rowReference ?? 'Free mounted',
            `x ${device.component.x_mm}\ny ${device.component.y_mm}\n${device.component.rotation} degrees`,
            `${device.definition.width_mm} mm\n${device.definition.din_modules === null ? 'Modules not specified' : `${device.definition.din_modules} modules`}`,
            device.component.notes ?? '-',
        ]),
    );

    const equipmentY = subsection(
        'Equipment quantities by catalog revision',
        componentBottom,
    );
    const equipmentBottom = table(
        [
            'Equipment',
            'Manufacturer',
            'Model',
            'Category',
            'Revision',
            'Quantity',
            'SKU',
        ],
        report.equipment.map(({ definition, quantity }) => [
            definition.display_name,
            definition.manufacturer,
            definition.model,
            words(definition.category),
            definition.revision,
            quantity,
            definition.sku ?? '-',
        ]),
        undefined,
        equipmentY,
    );

    if (report.rows.length || report.layout.ducts.length) {
        const hardwareY = subsection(
            'Panel hardware cut lengths',
            equipmentBottom,
        );
        const hardware: CellInput[][] = [
            ...report.rows.map((row) => [
                row.reference,
                'DIN rail',
                `${row.rail.length_mm} mm`,
                `${row.rail.width_mm} mm`,
                `x ${row.rail.x_mm}, y ${row.rail.y_mm}`,
            ]),
            ...report.layout.ducts.map((duct, index) => [
                referenceDuct(index),
                `Wire duct (${duct.orientation})`,
                `${duct.length_mm} mm`,
                `${duct.width_mm} mm`,
                `x ${duct.x_mm}, y ${duct.y_mm}`,
            ]),
        ];
        table(
            ['Reference', 'Hardware', 'Length', 'Width', 'Position (mm)'],
            hardware,
            undefined,
            hardwareY,
        );
    }

    section(
        'Terminal connection schedule',
        'Every catalog terminal is included. Multiple routes on one terminal occupy separate rows. SPARE means no route is connected.',
    );
    table(
        [
            'Device',
            'Terminal / label',
            'Purpose',
            'Wire / cable',
            'Connected to',
            'Notes',
        ],
        report.devices.flatMap((device) =>
            device.terminals.flatMap((terminal, terminalIndex) =>
                (terminal.routes.length
                    ? terminal.routes
                    : [
                          {
                              reference: 'SPARE',
                              connectedTo: 'Not connected',
                              notes: null,
                          },
                      ]
                ).map((route, routeIndex) => [
                    terminalIndex === 0 && routeIndex === 0
                        ? `${device.reference}\n${device.component.custom_label || device.definition.display_name}`
                        : device.reference,
                    terminal.key === terminal.label
                        ? terminal.key
                        : `${terminal.key} - ${terminal.label}`,
                    terminal.purpose ?? '-',
                    route.reference,
                    route.connectedTo,
                    route.notes ?? '-',
                ]),
            ),
        ),
        [63, 42, 45, 30, 100, 112],
    );

    section(
        'Cable and material summary',
        "Panel totals sum each run's routed polyline, including its share of any bundle trunk. This is not a building cable takeoff.",
    );
    table(
        [
            'Scope / class',
            'Cable type',
            'Gauge',
            'Conductors',
            'Runs',
            'Routes specified',
            'Panel routed total',
            'Building length',
        ],
        report.materials.map((material) => [
            `${material.scope}${material.cableClass ? `\n${classes[material.cableClass].label}` : ''}`,
            material.cableType,
            material.gauge ?? '-',
            material.conductorCount,
            material.runs,
            `${material.routedRuns} of ${material.runs}`,
            material.routedRuns
                ? meters(material.panelLengthMm)
                : 'Not specified',
            material.scope === 'Field cable' ? 'Not specified' : 'Panel only',
        ]),
    );

    const pages = pdf.getNumberOfPages();

    for (let page = 1; page <= pages; page++) {
        pdf.setPage(page);
        pdf.setFont('NotoSans', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(muted);
        pdf.setDrawColor('#dbe3ec');
        pdf.setLineWidth(0.2);
        const width = pdf.internal.pageSize.getWidth();
        const height = pdf.internal.pageSize.getHeight();
        pdf.line(margin, height - 15, width - margin, height - 15);
        pdf.text(
            (pdf.splitTextToSize(report.name, width - 90) as string[])[0],
            margin,
            height - 8,
        );
        pdf.text(
            `${page} / ${pages}  |  Wiring package`,
            width - margin,
            height - 8,
            { align: 'right' },
        );
    }

    return {
        blob: new Blob([pdf.output('arraybuffer')], {
            type: 'application/pdf',
        }),
        filename: report.filename,
    };
}

function referenceDuct(index: number): string {
    return `DUCT-${String(index + 1).padStart(2, '0')}`;
}

function drawTable(
    pdf: jsPDF,
    autoTable: typeof AutoTable,
    head: string[],
    body: CellInput[][],
    widths?: number[],
    continuationTitle = '',
    startY = 35,
): number {
    const availableWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const total = widths?.reduce((sum, width) => sum + width, 0) ?? 1;
    let bottomY = startY;
    autoTable(pdf, {
        startY,
        margin: { left: margin, right: margin, top: 35, bottom: 20 },
        head: [head],
        body: body.length
            ? body
            : [
                  [
                      {
                          content: 'No items defined in this design.',
                          colSpan: head.length,
                      },
                  ],
              ],
        theme: 'striped',
        styles: {
            font: 'NotoSans',
            fontSize: 10.5,
            cellPadding: 2.5,
            overflow: 'linebreak',
            textColor: ink,
            lineColor: '#dbe3ec',
            lineWidth: 0.15,
        },
        headStyles: {
            fillColor: accent,
            textColor: '#ffffff',
            fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: '#f3f6fa' },
        rowPageBreak: 'avoid',
        showHead: 'everyPage',
        willDrawPage: ({ pageNumber }) => {
            if (pageNumber > 1) {
                pdf.setFont('NotoSans', 'bold');
                pdf.setFontSize(20);
                pdf.setTextColor(ink);
                pdf.text(`${continuationTitle} (continued)`, margin, 17);
                pdf.setFont('NotoSans', 'normal');
                pdf.setFontSize(10.5);
                pdf.setTextColor(muted);
                pdf.text(
                    'Continued schedule. References match the diagrams and other sections.',
                    margin,
                    25,
                );
            }
        },
        didDrawPage: ({ cursor }) => {
            bottomY = cursor?.y ?? startY;
        },
        columnStyles: Object.fromEntries(
            (widths ?? []).map((width, index) => [
                index,
                { cellWidth: (width / total) * availableWidth },
            ]),
        ),
        didParseCell: ({ cell }) => {
            if (
                cell.text.some(
                    (line) => line.includes('UNASSIGNED') || line === 'SPARE',
                )
            ) {
                cell.styles.fontStyle = 'bold';
                cell.styles.textColor = '#92400e';
            }
        },
    });

    return bottomY;
}
