import {
    ArrowDown,
    ArrowUp,
    MoreHorizontal,
    Plus,
    Rows3,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { PanelDevice } from './panel-device';
import type { LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';

export function PanelBuilder({
    editor,
    layout,
    onAddDevice,
}: {
    editor: LightingEditorController;
    layout: LightingLayout;
    onAddDevice: (rowId?: string) => void;
}) {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [insertion, setInsertion] = useState<{
        row: string;
        index: number;
    } | null>(null);
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

    function drop(event: DragEvent, row: string, index: number) {
        event.preventDefault();
        const id = event.dataTransfer.getData('application/lighting-device');

        if (id) {
            const sourceItems = layout.components
                .filter((component) => component.rail_portable_id === row)
                .sort(
                    (left, right) =>
                        (left.sort_order ?? 0) - (right.sort_order ?? 0),
                );
            const sourceIndex = sourceItems.findIndex(
                (component) => component.portable_id === id,
            );
            editor.moveComponent(
                id,
                row,
                sourceIndex >= 0 && index > sourceIndex ? index - 1 : index,
            );
        }

        setDraggedId(null);
        setInsertion(null);
    }

    return (
        <div
            className="h-full overflow-auto bg-[radial-gradient(ellipse_at_top,#232730_0%,#171a20_65%)] px-5 py-5 xl:px-10"
            data-testid="lighting-canvas"
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
                                const items = layout.components
                                    .filter(
                                        (component) =>
                                            component.rail_portable_id ===
                                            row.portable_id,
                                    )
                                    .sort(
                                        (left, right) =>
                                            (left.sort_order ?? 0) -
                                            (right.sort_order ?? 0),
                                    );
                                const usedWidth = items.reduce(
                                    (width, item) =>
                                        width +
                                        (definitions.get(
                                            item.component_definition_id,
                                        )?.width_mm ?? 0),
                                    0,
                                );
                                const remaining = Math.max(
                                    0,
                                    row.length_mm - usedWidth,
                                );
                                const rowName = `Row ${String(rowIndex + 1).padStart(2, '0')}`;
                                const active =
                                    editor.selectedRowId === row.portable_id;

                                return (
                                    <section
                                        key={row.portable_id}
                                        aria-label={rowName}
                                        data-testid={`lighting-row-${row.portable_id}`}
                                        data-row-id={row.portable_id}
                                        data-order={row.sort_order ?? rowIndex}
                                        className={cn(
                                            'min-w-0 rounded-xl border bg-[#15181d] shadow-[inset_0_2px_6px_#0003]',
                                            active
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
                                                    {Math.round(remaining)} mm
                                                    available
                                                </span>
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
                                        <div className="min-w-0 [scrollbar-width:thin] overflow-x-auto p-2">
                                            <div className="relative flex min-h-[184px] w-max min-w-full items-center gap-3">
                                                <div
                                                    aria-hidden="true"
                                                    className="pointer-events-none absolute inset-x-0 top-10 h-7 rounded border-y border-[#7b8595]/50 bg-gradient-to-b from-[#596373] via-[#3d4654] to-[#657081] shadow-[0_2px_5px_#0008]"
                                                />
                                                {items.map(
                                                    (component, index) => {
                                                        const definition =
                                                            definitions.get(
                                                                component.component_definition_id,
                                                            );

                                                        if (!definition) {
                                                            return null;
                                                        }

                                                        return (
                                                            <div
                                                                key={
                                                                    component.portable_id
                                                                }
                                                                className={cn(
                                                                    'relative rounded-lg',
                                                                    insertion?.row ===
                                                                        row.portable_id &&
                                                                        insertion.index ===
                                                                            index &&
                                                                        'before:absolute before:inset-y-0 before:-left-2 before:w-1 before:rounded before:bg-blue-400',
                                                                )}
                                                                onDragOver={(
                                                                    event,
                                                                ) => {
                                                                    if (
                                                                        !draggedId
                                                                    ) {
                                                                        return;
                                                                    }

                                                                    event.preventDefault();
                                                                    const after =
                                                                        event.clientX >
                                                                        event.currentTarget.getBoundingClientRect()
                                                                            .left +
                                                                            event
                                                                                .currentTarget
                                                                                .offsetWidth /
                                                                                2;
                                                                    setInsertion(
                                                                        {
                                                                            row: row.portable_id,
                                                                            index:
                                                                                index +
                                                                                Number(
                                                                                    after,
                                                                                ),
                                                                        },
                                                                    );
                                                                }}
                                                                onDrop={(
                                                                    event,
                                                                ) =>
                                                                    drop(
                                                                        event,
                                                                        row.portable_id,
                                                                        insertion?.row ===
                                                                            row.portable_id
                                                                            ? insertion.index
                                                                            : index,
                                                                    )
                                                                }
                                                            >
                                                                <PanelDevice
                                                                    component={
                                                                        component
                                                                    }
                                                                    definition={
                                                                        definition
                                                                    }
                                                                    index={
                                                                        index
                                                                    }
                                                                    selected={
                                                                        editor
                                                                            .selection
                                                                            ?.type ===
                                                                            'component' &&
                                                                        editor
                                                                            .selection
                                                                            .id ===
                                                                            component.portable_id
                                                                    }
                                                                    onSelect={() =>
                                                                        editor.setSelection(
                                                                            {
                                                                                type: 'component',
                                                                                id: component.portable_id,
                                                                            },
                                                                        )
                                                                    }
                                                                    onDragStart={
                                                                        setDraggedId
                                                                    }
                                                                    onDragEnd={() => {
                                                                        setDraggedId(
                                                                            null,
                                                                        );
                                                                        setInsertion(
                                                                            null,
                                                                        );
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    },
                                                )}
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        'relative flex min-h-[184px] min-w-36 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-blue-400/25 bg-[#3b82f6]/[0.04] px-5 text-blue-300 transition-colors hover:border-blue-400/60 hover:bg-blue-500/10 focus-visible:outline-2 focus-visible:outline-blue-400',
                                                        insertion?.row ===
                                                            row.portable_id &&
                                                            insertion.index ===
                                                                items.length &&
                                                            'border-blue-400 bg-blue-500/15',
                                                    )}
                                                    aria-label={`Add device to ${rowName}`}
                                                    onClick={() =>
                                                        onAddDevice(
                                                            row.portable_id,
                                                        )
                                                    }
                                                    onDragOver={(event) => {
                                                        if (draggedId) {
                                                            event.preventDefault();
                                                            setInsertion({
                                                                row: row.portable_id,
                                                                index: items.length,
                                                            });
                                                        }
                                                    }}
                                                    onDrop={(event) =>
                                                        drop(
                                                            event,
                                                            row.portable_id,
                                                            items.length,
                                                        )
                                                    }
                                                >
                                                    <span className="flex size-9 items-center justify-center rounded-full border border-blue-400/25 bg-blue-500/10">
                                                        <Plus className="size-4" />
                                                    </span>
                                                    <span className="text-sm font-medium">
                                                        Add device
                                                    </span>
                                                    {items.length === 0 && (
                                                        <span className="max-w-64 text-center text-xs leading-5 text-slate-500">
                                                            Start with a dimmer,
                                                            relay, or power
                                                            supply.
                                                        </span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
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
                                        onDragStart={setDraggedId}
                                        onDragEnd={() => {
                                            setDraggedId(null);
                                            setInsertion(null);
                                        }}
                                    />
                                ) : null;
                            })}
                        </div>
                    </section>
                )}
                <p className="px-1 text-center text-xs text-slate-500">
                    Select a device for details. Drag between rows or use the
                    move controls.
                </p>
            </div>
        </div>
    );
}
