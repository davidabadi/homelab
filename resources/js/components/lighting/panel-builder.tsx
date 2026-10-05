import {
    ArrowDown,
    ArrowUp,
    MoreHorizontal,
    Plus,
    Rows3,
    Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { rowMmToPixels, rowPixelsToMm, snapDinPosition } from './din-placement';
import { PanelDevice } from './panel-device';
import {
    panelDevicePosition,
    panelRowItems,
    panelRowSpace,
} from './panel-layout';
import type { ComponentDefinition, DesignRail, LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';

type DragPreview = { id: string; rowId: string | null; xMm: number | null };
type PointerDrag = {
    id: string;
    pointerId: number;
    clientX: number;
    clientY: number;
    grabOffsetMm: number;
    active: boolean;
    preview: DragPreview;
};

function PhysicalRowTrack({
    row,
    layout,
    editor,
    definitions,
    preview,
    onTrack,
    onPointerDown,
}: {
    row: DesignRail;
    layout: LightingLayout;
    editor: LightingEditorController;
    definitions: Map<number, ComponentDefinition>;
    preview: DragPreview | null;
    onTrack: (rowId: string, element: HTMLDivElement | null) => void;
    onPointerDown: (event: PointerEvent<HTMLButtonElement>, id: string) => void;
}) {
    const track = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const items = panelRowItems(layout, row.portable_id);
    const scale = width / row.length_mm;
    const previewComponent =
        preview?.rowId === row.portable_id && preview.xMm !== null
            ? layout.components.find((item) => item.portable_id === preview.id)
            : undefined;
    const previewDefinition = previewComponent
        ? definitions.get(previewComponent.component_definition_id)
        : undefined;

    useEffect(() => {
        const element = track.current;

        if (!element) {
            return;
        }

        const observer = new ResizeObserver(([entry]) =>
            setWidth(entry.contentRect.width),
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return (
        <div className="min-w-0 p-2">
            <div
                ref={(element) => {
                    track.current = element;
                    onTrack(row.portable_id, element);
                }}
                className="relative h-[184px] w-full"
                data-testid={`lighting-row-track-${row.portable_id}`}
                data-rail-start-mm={row.x_mm}
                data-rail-length-mm={row.length_mm}
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-10 h-7 rounded border-y border-[#7b8595]/50 bg-gradient-to-b from-[#596373] via-[#3d4654] to-[#657081] shadow-[0_2px_5px_#0008]"
                />
                {width > 0 &&
                    items.map((component, index) => {
                        const definition = definitions.get(
                            component.component_definition_id,
                        );

                        return definition ? (
                            <div
                                key={component.portable_id}
                                className="absolute top-0"
                                style={{
                                    left: rowMmToPixels(
                                        component.x_mm,
                                        row.x_mm,
                                        scale,
                                    ),
                                }}
                            >
                                <PanelDevice
                                    component={component}
                                    definition={definition}
                                    index={index}
                                    width={definition.width_mm * scale}
                                    selected={
                                        editor.selection?.type ===
                                            'component' &&
                                        editor.selection.id ===
                                            component.portable_id
                                    }
                                    dragging={
                                        preview?.id === component.portable_id
                                    }
                                    onSelect={() =>
                                        editor.setSelection({
                                            type: 'component',
                                            id: component.portable_id,
                                        })
                                    }
                                    onPointerDown={onPointerDown}
                                    onNudge={(direction) =>
                                        editor.reorderComponent(
                                            component.portable_id,
                                            direction,
                                        )
                                    }
                                />
                            </div>
                        ) : null;
                    })}
                {previewComponent &&
                    previewDefinition &&
                    preview?.xMm !== null && (
                        <div
                            className="pointer-events-none absolute top-0 z-10"
                            data-testid="lighting-drag-preview"
                            style={{
                                left: rowMmToPixels(
                                    preview!.xMm!,
                                    row.x_mm,
                                    scale,
                                ),
                            }}
                        >
                            <PanelDevice
                                preview
                                component={previewComponent}
                                definition={previewDefinition}
                                index={items.length}
                                width={previewDefinition.width_mm * scale}
                                selected={false}
                                onSelect={() => undefined}
                            />
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded border border-blue-400/25 bg-[#202936] px-2 py-0.5 text-[11px] whitespace-nowrap text-blue-200">
                                {Number((preview!.xMm! - row.x_mm).toFixed(2))}{' '}
                                mm
                            </span>
                        </div>
                    )}
                {items.length === 0 && !previewComponent && (
                    <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-slate-500">
                        Ready for your first device
                    </p>
                )}
            </div>
        </div>
    );
}

export function PanelBuilder({
    editor,
    layout,
    onAddDevice,
}: {
    editor: LightingEditorController;
    layout: LightingLayout;
    onAddDevice: (rowId?: string) => void;
}) {
    const [preview, setPreview] = useState<DragPreview | null>(null);
    const tracks = useRef(new Map<string, HTMLDivElement>());
    const pointerDrag = useRef<PointerDrag | null>(null);
    const suppressClick = useRef(false);
    const rows = [...layout.rails].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const definitions = new Map(
        layout.definitions.map((definition) => [definition.id, definition]),
    );
    const unassigned = layout.components.filter(
        (component) =>
            !component.rail_portable_id ||
            !rows.some((row) => row.portable_id === component.rail_portable_id),
    );

    function cancelDrag() {
        if (pointerDrag.current?.active) {
            suppressClick.current = true;
        }

        pointerDrag.current = null;
        setPreview(null);
    }

    useEffect(() => {
        const cancel = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && pointerDrag.current) {
                event.preventDefault();

                if (pointerDrag.current.active) {
                    suppressClick.current = true;
                }

                pointerDrag.current = null;
                setPreview(null);
            }
        };
        window.addEventListener('keydown', cancel);

        return () => window.removeEventListener('keydown', cancel);
    }, []);

    function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
        if (event.button !== 0) {
            return;
        }

        const component = layout.components.find(
            (item) => item.portable_id === id,
        );
        const row = rows.find(
            (item) => item.portable_id === component?.rail_portable_id,
        );
        const track = row ? tracks.current.get(row.portable_id) : null;

        if (!component || !row || !track) {
            return;
        }

        suppressClick.current = false;
        const bounds = track.getBoundingClientRect();
        pointerDrag.current = {
            id,
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            grabOffsetMm:
                rowPixelsToMm(
                    event.clientX - bounds.left,
                    row.x_mm,
                    bounds.width / row.length_mm,
                ) - component.x_mm,
            active: false,
            preview: { id, rowId: row.portable_id, xMm: component.x_mm },
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function moveDrag(event: PointerEvent<HTMLDivElement>) {
        const drag = pointerDrag.current;

        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }

        if (
            !drag.active &&
            Math.hypot(
                event.clientX - drag.clientX,
                event.clientY - drag.clientY,
            ) < 4
        ) {
            return;
        }

        drag.active = true;
        event.preventDefault();
        const candidates = rows.flatMap((row) => {
            const element = tracks.current.get(row.portable_id);

            return element
                ? [{ row, bounds: element.getBoundingClientRect() }]
                : [];
        });
        const inside = candidates.some(
            ({ bounds }) =>
                event.clientY >= bounds.top - 24 &&
                event.clientY <= bounds.bottom + 24,
        );
        const target = inside
            ? candidates.sort(
                  (left, right) =>
                      Math.abs(
                          event.clientY -
                              (left.bounds.top + left.bounds.height / 2),
                      ) -
                      Math.abs(
                          event.clientY -
                              (right.bounds.top + right.bounds.height / 2),
                      ),
              )[0]
            : undefined;
        const component = layout.components.find(
            (item) => item.portable_id === drag.id,
        );
        const definition = component
            ? definitions.get(component.component_definition_id)
            : undefined;
        let xMm: number | null = null;

        if (target && definition && target.bounds.width > 0) {
            const desired =
                rowPixelsToMm(
                    event.clientX - target.bounds.left,
                    target.row.x_mm,
                    target.bounds.width / target.row.length_mm,
                ) - drag.grabOffsetMm;
            xMm = panelDevicePosition(
                layout,
                target.row.portable_id,
                definition.width_mm,
                snapDinPosition(desired, target.row.x_mm),
                drag.id,
            );
        }

        drag.preview = {
            id: drag.id,
            rowId: target?.row.portable_id ?? null,
            xMm,
        };
        setPreview(drag.preview);
    }

    function finishDrag(event: PointerEvent<HTMLDivElement>) {
        const drag = pointerDrag.current;

        if (!drag || drag.pointerId !== event.pointerId) {
            return;
        }

        if (drag.active) {
            suppressClick.current = true;

            if (drag.preview.rowId && drag.preview.xMm !== null) {
                editor.moveComponent(
                    drag.id,
                    drag.preview.rowId,
                    drag.preview.xMm,
                );
            }
        }

        pointerDrag.current = null;
        setPreview(null);
    }

    return (
        <div
            className="h-full overflow-auto bg-[radial-gradient(ellipse_at_top,#232730_0%,#171a20_65%)] px-5 py-5 xl:px-10"
            data-testid="lighting-canvas"
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
            onPointerDownCapture={() => {
                suppressClick.current = false;
            }}
            onClickCapture={(event) => {
                if (suppressClick.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressClick.current = false;
                }
            }}
        >
            <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
                <div className="flex items-end justify-between gap-4 px-1">
                    <div className="grid gap-1.5">
                        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
                            Your lighting panel
                        </h1>
                        <p className="text-sm text-slate-400">
                            Add devices, arrange your rows, and make room as you
                            go.
                        </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                        {rows.length} rows{' '}
                        <span className="px-1.5 text-slate-600">/</span>{' '}
                        {layout.components.length} devices
                    </span>
                </div>
                <section
                    aria-label="Lighting panel enclosure"
                    data-testid="lighting-enclosure"
                    className="relative rounded-2xl border border-[#68707e] bg-gradient-to-br from-[#747c88] via-[#444c59] to-[#69717e] p-3 shadow-[0_20px_60px_#0005,inset_0_1px_0_#ffffff35]"
                >
                    <div
                        aria-hidden="true"
                        className="absolute inset-x-5 top-1.5 flex justify-between"
                    >
                        <span className="size-1.5 rounded-full bg-[#242a33] shadow-[inset_0_1px_1px_#000]" />
                        <span className="size-1.5 rounded-full bg-[#242a33] shadow-[inset_0_1px_1px_#000]" />
                    </div>
                    <div className="overflow-hidden rounded-xl border border-black/60 bg-[#1b1e24] shadow-[inset_0_3px_10px_#0006]">
                        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
                            <span className="flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-300 uppercase">
                                <Rows3 className="size-4 text-slate-500" /> DIN
                                panel
                            </span>
                            <span className="text-xs text-slate-500">
                                {Math.round(
                                    (layout.design.width_mm -
                                        layout.design.margin_left_mm -
                                        layout.design.margin_right_mm) /
                                        18,
                                )}{' '}
                                module width
                            </span>
                        </div>
                        <div className="grid gap-3 p-3">
                            {rows.map((row, rowIndex) => {
                                const items = panelRowItems(
                                    layout,
                                    row.portable_id,
                                );
                                const space = panelRowSpace(
                                    layout,
                                    row.portable_id,
                                );
                                const rowName = `Row ${String(rowIndex + 1).padStart(2, '0')}`;
                                const active =
                                    editor.selectedRowId === row.portable_id;
                                const destination =
                                    preview?.rowId === row.portable_id;

                                return (
                                    <section
                                        key={row.portable_id}
                                        aria-label={rowName}
                                        data-testid={`lighting-row-${row.portable_id}`}
                                        data-row-id={row.portable_id}
                                        data-order={row.sort_order ?? rowIndex}
                                        data-drop-state={
                                            destination
                                                ? preview.xMm === null
                                                    ? 'full'
                                                    : 'valid'
                                                : undefined
                                        }
                                        className={cn(
                                            'min-w-0 rounded-xl border bg-[#15181d] shadow-[inset_0_2px_6px_#0003] transition-colors',
                                            destination
                                                ? preview.xMm === null
                                                    ? 'border-amber-400/50 bg-amber-400/[0.03]'
                                                    : 'border-blue-400/70 bg-blue-500/[0.04]'
                                                : active
                                                  ? 'border-blue-400/35'
                                                  : 'border-white/10',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-1">
                                            <button
                                                type="button"
                                                className="flex items-center gap-2.5 rounded text-sm font-semibold text-slate-200 focus-visible:outline-2 focus-visible:outline-blue-400"
                                                onClick={() =>
                                                    editor.selectRow(
                                                        row.portable_id,
                                                    )
                                                }
                                            >
                                                <span
                                                    aria-hidden="true"
                                                    className={cn(
                                                        'size-1.5 rounded-full',
                                                        active
                                                            ? 'bg-blue-400'
                                                            : 'bg-slate-600',
                                                    )}
                                                />
                                                {rowName}
                                            </button>
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500">
                                                    {space.total_free_mm} mm
                                                    free{' '}
                                                    <span className="hidden sm:inline">
                                                        · {space.largest_gap_mm}{' '}
                                                        mm largest gap
                                                    </span>
                                                </span>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="size-6 text-blue-300"
                                                    aria-label={`Add device to ${rowName}`}
                                                    onClick={() =>
                                                        onAddDevice(
                                                            row.portable_id,
                                                        )
                                                    }
                                                >
                                                    <Plus />
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-6 text-slate-400"
                                                            aria-label={`${rowName} options`}
                                                        >
                                                            <MoreHorizontal />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent
                                                        className="lighting-editor-overlay dark w-48"
                                                        align="end"
                                                    >
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                editor.addRow(
                                                                    row.portable_id,
                                                                    'above',
                                                                )
                                                            }
                                                        >
                                                            <Plus /> Add row
                                                            above
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                editor.addRow(
                                                                    row.portable_id,
                                                                    'below',
                                                                )
                                                            }
                                                        >
                                                            <Plus /> Add row
                                                            below
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            disabled={
                                                                rowIndex === 0
                                                            }
                                                            onClick={() =>
                                                                editor.moveRow(
                                                                    row.portable_id,
                                                                    -1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowUp /> Move row
                                                            up
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            disabled={
                                                                rowIndex ===
                                                                rows.length - 1
                                                            }
                                                            onClick={() =>
                                                                editor.moveRow(
                                                                    row.portable_id,
                                                                    1,
                                                                )
                                                            }
                                                        >
                                                            <ArrowDown /> Move
                                                            row down
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            disabled={
                                                                items.length > 0
                                                            }
                                                            className="text-red-400 focus:text-red-300"
                                                            onClick={() =>
                                                                editor.removeRow(
                                                                    row.portable_id,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 /> Remove
                                                            empty row
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                        <PhysicalRowTrack
                                            row={row}
                                            layout={layout}
                                            editor={editor}
                                            definitions={definitions}
                                            preview={preview}
                                            onTrack={(rowId, element) => {
                                                if (element) {
                                                    tracks.current.set(
                                                        rowId,
                                                        element,
                                                    );
                                                } else {
                                                    tracks.current.delete(
                                                        rowId,
                                                    );
                                                }
                                            }}
                                            onPointerDown={startDrag}
                                        />
                                    </section>
                                );
                            })}
                            <Button
                                variant="ghost"
                                className="h-10 border border-dashed border-white/15 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                                onClick={() =>
                                    editor.addRow(
                                        rows.at(-1)?.portable_id,
                                        'below',
                                    )
                                }
                            >
                                <Plus /> Add row below
                            </Button>
                        </div>
                    </div>
                </section>
                {unassigned.length > 0 && (
                    <section
                        className="grid gap-4 rounded-xl border border-amber-400/15 bg-[#1b1e24] p-5"
                        aria-label="Unassigned devices"
                    >
                        <div className="grid gap-1">
                            <h2 className="text-sm font-semibold text-slate-200">
                                Unassigned devices{' '}
                                <span className="ml-1 text-slate-500">
                                    {unassigned.length}
                                </span>
                            </h2>
                            <p className="text-sm text-slate-400">
                                Your existing devices are preserved here. Select
                                a DIN device to move it into a row.
                            </p>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1">
                            {unassigned.map((component, index) => {
                                const definition = definitions.get(
                                    component.component_definition_id,
                                );

                                return definition ? (
                                    <PanelDevice
                                        key={component.portable_id}
                                        component={component}
                                        definition={definition}
                                        index={index}
                                        selected={
                                            editor.selection?.type ===
                                                'component' &&
                                            editor.selection.id ===
                                                component.portable_id
                                        }
                                        onSelect={() =>
                                            editor.setSelection({
                                                type: 'component',
                                                id: component.portable_id,
                                            })
                                        }
                                    />
                                ) : null;
                            })}
                        </div>
                    </section>
                )}
                <p
                    className="px-1 text-center text-xs text-slate-500"
                    aria-live="polite"
                >
                    {preview?.rowId && preview.xMm === null
                        ? 'No gap on this row can fit this device.'
                        : 'Select a device for details. Drag along the rail or between rows; use arrow keys for 1 mm moves.'}
                </p>
            </div>
        </div>
    );
}
