import { ArrowLeft, ArrowRight, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cableClassStyle } from './cabling-style';
import { ComponentImage } from './component-image';
import {
    getTerminalConnections,
    terminalConnectionSummary,
    terminalDisplayLabel,
} from './connection-lookup';
import { nudgeDinPosition } from './din-placement';
import { NotesField, ReadOnlyValue } from './inspector-fields';
import { panelDevicePosition } from './panel-layout';
import { RoutePicker } from './route-picker';
import type {
    ComponentDefinition,
    LightingLayout,
    LightingSelection,
    PlacedComponent,
} from './types';

export function DeviceProperties({
    component,
    definition,
    layout,
    onUpdate,
    onDuplicate,
    onMove,
    onReorder,
    onSelectionChange,
}: {
    component: PlacedComponent;
    definition: ComponentDefinition;
    layout?: LightingLayout;
    onUpdate: (id: string, patch: Partial<PlacedComponent>) => void;
    onDuplicate: (id: string) => void;
    onDetach?: (id: string) => void;
    onMove?: (id: string, rowId: string) => void;
    onReorder?: (id: string, direction: -1 | 1) => void;
    onSelectionChange?: (selection: LightingSelection) => void;
}) {
    const [pickerTerminal, setPickerTerminal] = useState<string | null>(null);
    const pickerDefinition = definition.terminals.find(
        (terminal) => terminal.key === pickerTerminal,
    );
    const pickerConnections =
        layout && pickerTerminal
            ? getTerminalConnections(
                  layout,
                  component.portable_id,
                  pickerTerminal,
              )
            : [];
    const rows = [...(layout?.rails ?? [])].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const row = rows.find(
        (item) => item.portable_id === component.rail_portable_id,
    );
    const canNudge = (direction: -1 | 1): boolean => {
        if (!layout || !row) {
            return false;
        }

        const candidate = nudgeDinPosition(component.x_mm, direction);

        return (
            panelDevicePosition(
                layout,
                row.portable_id,
                definition.width_mm,
                candidate,
                component.portable_id,
            ) === candidate
        );
    };

    return (
        <>
            <div className="mx-auto h-32 w-32 rounded-xl bg-[#e7e9ed] p-3">
                <ComponentImage definition={definition} />
            </div>
            <div className="grid gap-2">
                <p className="text-base leading-6 font-semibold text-slate-100">
                    {definition.display_name}
                </p>
                <p className="text-xs leading-5 break-words text-slate-400">
                    {definition.manufacturer} · {definition.model} · rev{' '}
                    {definition.revision}
                </p>
            </div>
            <label className="grid gap-2 text-sm text-slate-300">
                Custom label
                <Input
                    className="h-10 border-white/15 bg-white/5 text-sm"
                    value={component.custom_label ?? ''}
                    placeholder={definition.display_name}
                    onChange={(event) =>
                        onUpdate(component.portable_id, {
                            custom_label: event.target.value || null,
                        })
                    }
                />
            </label>
            {layout && onMove && definition.mounting_type === 'din-rail' && (
                <div className="grid gap-3">
                    <label className="grid gap-2 text-sm text-slate-300">
                        Move to row
                        <select
                            className="h-10 rounded-md border border-white/15 bg-[#252a33] px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                            value={component.rail_portable_id ?? ''}
                            onChange={(event) =>
                                onMove(
                                    component.portable_id,
                                    event.target.value,
                                )
                            }
                        >
                            {!component.rail_portable_id && (
                                <option value="" disabled>
                                    Choose a row
                                </option>
                            )}
                            {rows.map((row, rowIndex) => (
                                <option
                                    key={row.portable_id}
                                    value={row.portable_id}
                                >
                                    Row {String(rowIndex + 1).padStart(2, '0')}
                                </option>
                            ))}
                        </select>
                    </label>
                    {component.rail_portable_id && onReorder && (
                        <label className="grid gap-2 text-sm text-slate-300">
                            Position on row (mm)
                            <Input
                                key={`${component.portable_id}:${component.x_mm}`}
                                className="h-10 border-white/15 bg-white/5 text-sm"
                                type="number"
                                min={0}
                                max={
                                    row
                                        ? row.length_mm - definition.width_mm
                                        : undefined
                                }
                                step="1"
                                defaultValue={Number(
                                    (component.x_mm - (row?.x_mm ?? 0)).toFixed(
                                        2,
                                    ),
                                )}
                                onBlur={(event) => {
                                    const relativePosition = Number(
                                        event.target.value,
                                    );
                                    const candidate =
                                        relativePosition + (row?.x_mm ?? 0);

                                    if (
                                        event.target.value !== '' &&
                                        Number.isFinite(relativePosition)
                                    ) {
                                        onUpdate(component.portable_id, {
                                            x_mm: candidate,
                                        });
                                    }

                                    if (
                                        event.target.value === '' ||
                                        !Number.isFinite(relativePosition) ||
                                        !row ||
                                        panelDevicePosition(
                                            layout,
                                            row.portable_id,
                                            definition.width_mm,
                                            candidate,
                                            component.portable_id,
                                        ) !== candidate
                                    ) {
                                        event.target.value = String(
                                            Number(
                                                (
                                                    component.x_mm -
                                                    (row?.x_mm ?? 0)
                                                ).toFixed(2),
                                            ),
                                        );
                                    }
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                    }
                                }}
                            />
                        </label>
                    )}
                    {component.rail_portable_id && onReorder && (
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canNudge(-1)}
                                onClick={() =>
                                    onReorder(component.portable_id, -1)
                                }
                            >
                                <ArrowLeft /> Move left
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!canNudge(1)}
                                onClick={() =>
                                    onReorder(component.portable_id, 1)
                                }
                            >
                                <ArrowRight /> Move right
                            </Button>
                        </div>
                    )}
                </div>
            )}
            {definition.mounting_type !== 'din-rail' && (
                <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-5 text-slate-400">
                    This device uses {definition.mounting_type} mounting and
                    stays in the unassigned area.
                </p>
            )}
            <dl className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-4">
                <ReadOnlyValue
                    label="Manufacturer"
                    value={definition.manufacturer}
                />
                <ReadOnlyValue
                    label="Width"
                    value={`${definition.width_mm} mm`}
                />
                <ReadOnlyValue
                    label="Height"
                    value={`${definition.height_mm} mm`}
                />
                <ReadOnlyValue
                    label="Depth"
                    value={
                        definition.depth_mm === null
                            ? null
                            : `${definition.depth_mm} mm`
                    }
                />
                {definition.din_modules !== null && (
                    <ReadOnlyValue
                        label="DIN modules"
                        value={definition.din_modules}
                    />
                )}
            </dl>
            <NotesField
                value={component.notes}
                onChange={(notes) => onUpdate(component.portable_id, { notes })}
            />
            <details
                className="rounded-lg border border-white/10 p-3"
                open={onSelectionChange ? true : undefined}
            >
                <summary className="cursor-pointer text-sm font-medium text-slate-300">
                    Terminals ({definition.terminals.length})
                </summary>
                <div className="mt-3 grid gap-2">
                    {definition.terminals.length === 0 && (
                        <p className="text-xs text-slate-500">
                            No terminals in this catalog revision.
                        </p>
                    )}
                    {definition.terminals.map((terminal) => {
                        const connections = layout
                            ? getTerminalConnections(
                                  layout,
                                  component.portable_id,
                                  terminal.key,
                              )
                            : [];
                        const summary = terminalConnectionSummary(connections);
                        const route =
                            connections.length === 1 ? connections[0] : null;
                        const clickable =
                            connections.length > 0 &&
                            Boolean(onSelectionChange);
                        const classStyle = route?.cableClass
                            ? cableClassStyle(route.cableClass)
                            : null;
                        const content = (
                            <>
                                <span className="flex items-baseline gap-2">
                                    <span className="font-mono font-semibold text-slate-200">
                                        {terminalDisplayLabel(terminal)}
                                    </span>
                                    <span className="min-w-0 flex-1 text-slate-400">
                                        {terminal.purpose || terminal.side}
                                    </span>
                                    {summary.status === 'internal' && (
                                        <span className="shrink-0 text-[10px] text-slate-400">
                                            Internal
                                        </span>
                                    )}
                                    {summary.status === 'field' && (
                                        <span
                                            className="shrink-0 text-[10px]"
                                            style={{ color: classStyle?.color }}
                                        >
                                            Field cable
                                        </span>
                                    )}
                                </span>
                                <span className="flex items-center gap-2">
                                    <span
                                        className={`min-w-0 flex-1 break-words ${connections.length ? 'text-slate-300' : 'text-slate-500'}`}
                                    >
                                        {summary.label}
                                        {route?.gauge && ` · ${route.gauge}`}
                                    </span>
                                    {clickable && (
                                        <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                                    )}
                                </span>
                                {classStyle && (
                                    <span className="text-[10px] text-slate-500">
                                        {classStyle.label}
                                        {route?.inheritedCableClass &&
                                            ' · from bundle'}
                                    </span>
                                )}
                            </>
                        );

                        return clickable ? (
                            <button
                                key={terminal.key}
                                type="button"
                                data-terminal-key={terminal.key}
                                className="grid w-full gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-left text-xs transition-colors hover:border-blue-400/50 hover:bg-blue-400/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                onClick={() => {
                                    if (summary.selection) {
                                        onSelectionChange?.(summary.selection);
                                    } else {
                                        setPickerTerminal(terminal.key);
                                    }
                                }}
                            >
                                {content}
                            </button>
                        ) : (
                            <div
                                key={terminal.key}
                                data-terminal-key={terminal.key}
                                className="grid gap-1 rounded-md border border-white/5 bg-white/[0.025] px-2.5 py-2 text-xs"
                            >
                                {content}
                            </div>
                        );
                    })}
                </div>
            </details>
            {onSelectionChange && (
                <RoutePicker
                    routes={pickerConnections}
                    open={pickerTerminal !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setPickerTerminal(null);
                        }
                    }}
                    onSelect={onSelectionChange}
                    title={`${pickerDefinition ? terminalDisplayLabel(pickerDefinition) : 'Terminal'} · ${pickerConnections.length} connections`}
                    description="Choose the wire or field cable to inspect."
                />
            )}
            <Button
                variant="outline"
                size="sm"
                onClick={() => onDuplicate(component.portable_id)}
            >
                <Copy /> Duplicate device
            </Button>
        </>
    );
}
