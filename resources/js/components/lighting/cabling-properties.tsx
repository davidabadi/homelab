import { ArrowLeft, Cable, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cableClasses, cableClassStyle } from './cabling-style';
import {
    bundleBreakoutPoint,
    cableEntrySideLength,
    clampCableEntryOffset,
    externalCableLengthMm,
} from './external-cabling';
import { cableLengthMm, updateRouteEndpoints } from './geometry';
import { NotesField, NumberField, TextField } from './inspector-fields';
import type {
    CableBundle,
    CableClass,
    CableDirection,
    CableEntry,
    ExternalCable,
    LightingLayout,
} from './types';
import type { LightingEditorController } from './use-lighting-editor';

export function CablingSelect({
    label,
    value,
    onChange,
    children,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <select
                aria-label={label}
                className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                {children}
            </select>
        </label>
    );
}

function ClassFields({
    cableClass,
    direction,
    onClass,
    onDirection,
}: {
    cableClass: CableClass;
    direction: CableDirection;
    onClass: (value: CableClass) => void;
    onDirection: (value: CableDirection) => void;
}) {
    return (
        <>
            <CablingSelect
                label="Cable class"
                value={cableClass}
                onChange={(value) => onClass(value as CableClass)}
            >
                {Object.entries(cableClasses).map(([value, style]) => (
                    <option key={value} value={value}>
                        {style.label}
                    </option>
                ))}
            </CablingSelect>
            <CablingSelect
                label="Direction"
                value={direction}
                onChange={(value) => onDirection(value as CableDirection)}
            >
                <option value="incoming">Incoming</option>
                <option value="outgoing">Outgoing</option>
                <option value="mixed">Mixed</option>
            </CablingSelect>
        </>
    );
}

function CableList({
    cables,
    editor,
}: {
    cables: ExternalCable[];
    editor: LightingEditorController;
}) {
    return (
        <div className="grid gap-2">
            {cables.map((cable) => (
                <button
                    key={cable.portable_id}
                    type="button"
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-3 text-left hover:border-blue-400/40"
                    onClick={() =>
                        editor.setSelection({
                            type: 'external_cable',
                            id: cable.portable_id,
                        })
                    }
                >
                    <span className="min-w-0 text-sm text-slate-200">
                        {cable.label}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                        {cable.internal_component_portable_id
                            ? 'Assigned'
                            : 'Unassigned'}
                    </span>
                </button>
            ))}
        </div>
    );
}

export function CableEntryProperties({
    entry,
    layout,
    editor,
}: {
    entry: CableEntry;
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    const bundles = layout.cable_bundles.filter(
        (item) => item.cable_entry_portable_id === entry.portable_id,
    );
    const standalone = layout.external_cables.filter(
        (item) => item.cable_entry_portable_id === entry.portable_id,
    );
    const sideLength = cableEntrySideLength(entry, layout.design);
    const used = bundles.length > 0 || standalone.length > 0;

    return (
        <>
            <TextField
                label="Entry label"
                value={entry.label}
                onChange={(label) =>
                    editor.updateCableEntry(entry.portable_id, {
                        label: label ?? '',
                    })
                }
            />
            <CablingSelect
                label="Enclosure side"
                value={entry.side}
                onChange={(side) => {
                    const next = { ...entry, side: side as CableEntry['side'] };
                    next.span_mm = Math.min(
                        next.span_mm,
                        cableEntrySideLength(next, layout.design),
                    );
                    editor.updateCableEntry(entry.portable_id, {
                        side: next.side,
                        span_mm: next.span_mm,
                        offset_mm: clampCableEntryOffset(next, layout.design),
                    });
                }}
            >
                <option value="top">Top</option>
                <option value="right">Right</option>
                <option value="bottom">Bottom</option>
                <option value="left">Left</option>
            </CablingSelect>
            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="Offset (mm)"
                    value={entry.offset_mm}
                    min={0}
                    max={sideLength - entry.span_mm}
                    onChange={(offset_mm) =>
                        offset_mm !== null &&
                        editor.updateCableEntry(entry.portable_id, {
                            offset_mm,
                        })
                    }
                />
                <NumberField
                    label="Opening span (mm)"
                    value={entry.span_mm}
                    min={0.01}
                    max={sideLength}
                    onChange={(span_mm) =>
                        span_mm !== null &&
                        editor.updateCableEntry(entry.portable_id, { span_mm })
                    }
                />
            </div>
            <p className="text-xs leading-5 text-slate-500">
                Offset starts at the{' '}
                {entry.side === 'top' || entry.side === 'bottom'
                    ? 'left'
                    : 'top'}{' '}
                enclosure edge. Drag the opening along its selected side.
            </p>
            <CablingSelect
                label="Entry type"
                value={entry.entry_type}
                onChange={(entry_type) =>
                    editor.updateCableEntry(entry.portable_id, {
                        entry_type: entry_type as CableEntry['entry_type'],
                    })
                }
            >
                <option value="conduit">Conduit</option>
                <option value="cable_gland">Cable gland</option>
                <option value="gland_plate">Gland plate</option>
                <option value="cable_tray">Cable tray</option>
                <option value="open_entry">Open entry</option>
                <option value="other">Other</option>
            </CablingSelect>
            <NotesField
                value={entry.notes}
                onChange={(notes) =>
                    editor.updateCableEntry(entry.portable_id, { notes })
                }
            />
            <div className="grid gap-3 border-t border-white/10 pt-4">
                <p className="text-sm font-medium">Bundles at this entry</p>
                {bundles.map((bundle) => {
                    const style = cableClassStyle(bundle.cable_class);

                    return (
                        <button
                            key={bundle.portable_id}
                            type="button"
                            className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-left text-sm hover:border-blue-400/40"
                            onClick={() =>
                                editor.setSelection({
                                    type: 'cable_bundle',
                                    id: bundle.portable_id,
                                })
                            }
                        >
                            <style.icon
                                className="size-4 shrink-0"
                                style={{
                                    color: bundle.display_color ?? style.color,
                                }}
                            />
                            <span>
                                {bundle.name}
                                <span className="mt-1 block text-xs text-slate-500">
                                    {style.label}
                                </span>
                            </span>
                        </button>
                    );
                })}
                <Button
                    variant="outline"
                    onClick={() => editor.addCableBundle(entry.portable_id)}
                >
                    <Plus /> Add bundle
                </Button>
                <Button
                    variant="ghost"
                    onClick={() =>
                        editor.addExternalCable(undefined, entry.portable_id)
                    }
                >
                    <Plus /> Add standalone cable
                </Button>
                <CableList cables={standalone} editor={editor} />
            </div>
            <Button
                variant="ghost"
                disabled={used}
                className="justify-start text-red-300"
                onClick={() => editor.deleteSelection()}
            >
                <Trash2 /> Delete entry
            </Button>
            {used && (
                <p className="text-xs leading-5 text-slate-500">
                    Reassign or remove its bundles and standalone cables before
                    deleting this entry.
                </p>
            )}
        </>
    );
}

export function CableBundleProperties({
    bundle,
    layout,
    editor,
}: {
    bundle: CableBundle;
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const cables = layout.external_cables.filter(
        (item) => item.bundle_portable_id === bundle.portable_id,
    );
    const breakout = bundleBreakoutPoint(bundle);

    function updateBreakout(xMm: number, yMm: number) {
        const start = bundle.route_points[0];

        if (start) {
            editor.updateCableBundle(bundle.portable_id, {
                route_points: updateRouteEndpoints(bundle.route_points, start, {
                    x_mm: xMm,
                    y_mm: yMm,
                }),
            });
        }
    }

    return (
        <>
            <TextField
                label="Bundle name"
                value={bundle.name}
                onChange={(name) =>
                    editor.updateCableBundle(bundle.portable_id, {
                        name: name ?? '',
                    })
                }
            />
            <CablingSelect
                label="Cable entry"
                value={bundle.cable_entry_portable_id}
                onChange={(cable_entry_portable_id) =>
                    editor.updateCableBundle(bundle.portable_id, {
                        cable_entry_portable_id,
                    })
                }
            >
                {layout.cable_entries.map((entry) => (
                    <option key={entry.portable_id} value={entry.portable_id}>
                        {entry.label} · {entry.side}
                    </option>
                ))}
            </CablingSelect>
            <TextField
                label="External location"
                value={bundle.external_location}
                onChange={(external_location) =>
                    editor.updateCableBundle(bundle.portable_id, {
                        external_location,
                    })
                }
            />
            <ClassFields
                cableClass={bundle.cable_class}
                direction={bundle.direction}
                onClass={(cable_class) =>
                    editor.updateCableBundle(bundle.portable_id, {
                        cable_class,
                    })
                }
                onDirection={(direction) =>
                    editor.updateCableBundle(bundle.portable_id, { direction })
                }
            />
            <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                Display color
                <Input
                    aria-label="Bundle display color"
                    type="color"
                    className="h-9 w-16 cursor-pointer p-1"
                    value={
                        bundle.display_color ??
                        cableClassStyle(bundle.cable_class).color
                    }
                    onChange={(event) =>
                        editor.updateCableBundle(bundle.portable_id, {
                            display_color: event.target.value,
                        })
                    }
                />
            </label>
            <NumberField
                label="Planned cables"
                value={bundle.planned_count}
                nullable
                min={0}
                max={10000}
                onChange={(planned_count) =>
                    (planned_count === null ||
                        Number.isInteger(planned_count)) &&
                    editor.updateCableBundle(bundle.portable_id, {
                        planned_count,
                    })
                }
            />
            <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                <p>
                    {cables.length} defined ·{' '}
                    {
                        cables.filter(
                            (item) => !item.internal_component_portable_id,
                        ).length
                    }{' '}
                    unassigned
                </p>
                <p className="mt-1 text-xs text-slate-500">
                    Shared panel trunk:{' '}
                    {(cableLengthMm(bundle.route_points) / 1000).toFixed(3)} m
                </p>
            </div>
            {breakout && (
                <details className="rounded-lg border border-white/10 p-3">
                    <summary className="cursor-pointer text-sm">
                        Breakout position
                    </summary>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                        <NumberField
                            label="Breakout X (mm)"
                            value={breakout.x_mm}
                            min={0}
                            max={layout.design.width_mm}
                            onChange={(value) =>
                                value !== null &&
                                updateBreakout(value, breakout.y_mm)
                            }
                        />
                        <NumberField
                            label="Breakout Y (mm)"
                            value={breakout.y_mm}
                            min={0}
                            max={layout.design.height_mm}
                            onChange={(value) =>
                                value !== null &&
                                updateBreakout(breakout.x_mm, value)
                            }
                        />
                    </div>
                </details>
            )}
            <p className="text-xs leading-5 text-slate-500">
                In Wiring view, drag the shared trunk or breakout to route this
                bundle. Individual cables branch after the breakout.
            </p>
            <NotesField
                value={bundle.notes}
                onChange={(notes) =>
                    editor.updateCableBundle(bundle.portable_id, { notes })
                }
            />
            <Button
                variant="outline"
                onClick={() => editor.addExternalCable(bundle.portable_id)}
            >
                <Plus /> Add cable
            </Button>
            <CableList cables={cables} editor={editor} />
            <Button
                variant="ghost"
                className="justify-start text-red-300"
                onClick={() =>
                    cables.length
                        ? setConfirmDelete(true)
                        : editor.deleteSelection()
                }
            >
                <Trash2 /> Delete bundle
            </Button>
            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent className="lighting-editor-overlay dark">
                    <DialogHeader>
                        <DialogTitle>Delete bundle and cables?</DialogTitle>
                        <DialogDescription>
                            This removes {bundle.name} and its {cables.length}{' '}
                            defined cables from this design. Undo can restore
                            them.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setConfirmDelete(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                editor.deleteSelection(true);
                                setConfirmDelete(false);
                            }}
                        >
                            Delete bundle and cables
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function TerminationFields({
    cable,
    layout,
    editor,
}: {
    cable: ExternalCable;
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    const [componentId, setComponentId] = useState(
        cable.internal_component_portable_id ?? '',
    );
    const component = layout.components.find(
        (item) => item.portable_id === componentId,
    );
    const definition = layout.definitions.find(
        (item) => item.id === component?.component_definition_id,
    );
    const terminal =
        cable.internal_component_portable_id === componentId
            ? (cable.internal_terminal ?? '')
            : '';

    return (
        <div className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
                <Cable className="size-4" /> Internal termination
            </p>
            <CablingSelect
                label="Internal component"
                value={componentId}
                onChange={(value) => {
                    setComponentId(value);

                    if (!value) {
                        editor.updateExternalCable(cable.portable_id, {
                            internal_component_portable_id: null,
                            internal_terminal: null,
                            branch_route_points: [],
                        });
                    }
                }}
            >
                <option value="">Unassigned</option>
                {layout.components.map((item) => {
                    const catalog = layout.definitions.find(
                        (candidate) =>
                            candidate.id === item.component_definition_id,
                    );

                    return (
                        <option key={item.portable_id} value={item.portable_id}>
                            {item.custom_label ||
                                catalog?.display_name ||
                                'Device'}
                        </option>
                    );
                })}
            </CablingSelect>
            {componentId && (
                <CablingSelect
                    label="Internal terminal"
                    value={terminal}
                    onChange={(internal_terminal) => {
                        if (internal_terminal) {
                            editor.updateExternalCable(cable.portable_id, {
                                internal_component_portable_id: componentId,
                                internal_terminal,
                            });
                        }
                    }}
                >
                    <option value="">Choose a terminal</option>
                    {definition?.terminals.map((item) => (
                        <option key={item.key} value={item.key}>
                            {item.label}
                            {item.purpose ? ` · ${item.purpose}` : ''}
                        </option>
                    ))}
                </CablingSelect>
            )}
            <p className="text-xs leading-5 text-slate-500">
                {componentId && !terminal
                    ? 'Choose a terminal to save the assignment.'
                    : componentId
                      ? 'The branch follows this device when it moves.'
                      : 'This field cable can be planned before choosing its panel terminal.'}
            </p>
        </div>
    );
}

export function ExternalCableProperties({
    cable,
    layout,
    editor,
}: {
    cable: ExternalCable;
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    const bundle = layout.cable_bundles.find(
        (item) => item.portable_id === cable.bundle_portable_id,
    );
    const origin = bundle
        ? `bundle:${bundle.portable_id}`
        : `entry:${cable.cable_entry_portable_id}`;

    return (
        <>
            {bundle && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="justify-start px-0 text-slate-400"
                    onClick={() =>
                        editor.setSelection({
                            type: 'cable_bundle',
                            id: bundle.portable_id,
                        })
                    }
                >
                    <ArrowLeft /> Back to bundle
                </Button>
            )}
            <TextField
                label="Cable label"
                value={cable.label}
                onChange={(label) =>
                    editor.updateExternalCable(cable.portable_id, {
                        label: label ?? '',
                    })
                }
            />
            <CablingSelect
                label="Cable origin"
                value={origin}
                onChange={(value) => {
                    const [kind, id] = value.split(':');
                    editor.updateExternalCable(cable.portable_id, {
                        bundle_portable_id: kind === 'bundle' ? id : null,
                        cable_entry_portable_id: kind === 'entry' ? id : null,
                        branch_route_points: [],
                        cable_class:
                            kind === 'bundle'
                                ? null
                                : (bundle?.cable_class ??
                                  cable.cable_class ??
                                  'other'),
                        direction:
                            kind === 'bundle'
                                ? null
                                : (bundle?.direction ??
                                  cable.direction ??
                                  'mixed'),
                    });
                }}
            >
                <optgroup label="Shared bundles">
                    {layout.cable_bundles.map((item) => (
                        <option
                            key={item.portable_id}
                            value={`bundle:${item.portable_id}`}
                        >
                            {item.name}
                        </option>
                    ))}
                </optgroup>
                <optgroup label="Standalone at an entry">
                    {layout.cable_entries.map((item) => (
                        <option
                            key={item.portable_id}
                            value={`entry:${item.portable_id}`}
                        >
                            {item.label}
                        </option>
                    ))}
                </optgroup>
            </CablingSelect>
            {bundle ? (
                <p className="text-xs leading-5 text-slate-500">
                    {cableClassStyle(bundle.cable_class).label} ·{' '}
                    {bundle.direction} · shares {bundle.name}&apos;s trunk.
                </p>
            ) : (
                <ClassFields
                    cableClass={cable.cable_class ?? 'other'}
                    direction={cable.direction ?? 'mixed'}
                    onClass={(cable_class) =>
                        editor.updateExternalCable(cable.portable_id, {
                            cable_class,
                        })
                    }
                    onDirection={(direction) =>
                        editor.updateExternalCable(cable.portable_id, {
                            direction,
                        })
                    }
                />
            )}
            <TextField
                label="Cable type"
                value={cable.cable_type}
                onChange={(cable_type) =>
                    editor.updateExternalCable(cable.portable_id, {
                        cable_type: cable_type ?? '',
                    })
                }
            />
            <div className="grid grid-cols-2 gap-3">
                <TextField
                    label="Gauge"
                    value={cable.gauge}
                    onChange={(gauge) =>
                        editor.updateExternalCable(cable.portable_id, { gauge })
                    }
                />
                <NumberField
                    label="Conductors"
                    value={cable.conductor_count}
                    min={1}
                    max={100}
                    onChange={(conductor_count) =>
                        conductor_count !== null &&
                        Number.isInteger(conductor_count) &&
                        editor.updateExternalCable(cable.portable_id, {
                            conductor_count,
                        })
                    }
                />
            </div>
            <TerminationFields
                key={`${cable.portable_id}:${cable.internal_component_portable_id ?? 'unassigned'}`}
                cable={cable}
                layout={layout}
                editor={editor}
            />
            {cable.internal_component_portable_id && (
                <div className="rounded-lg border border-white/10 p-3">
                    <p className="text-xs text-slate-400">
                        Panel routed length
                    </p>
                    <p className="mt-1 text-lg font-medium">
                        {(externalCableLengthMm(cable, layout) / 1000).toFixed(
                            3,
                        )}{' '}
                        m
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        Shared trunk + branch, excluding building cabling and
                        slack.
                    </p>
                </div>
            )}
            <NotesField
                value={cable.notes}
                onChange={(notes) =>
                    editor.updateExternalCable(cable.portable_id, { notes })
                }
            />
            <Button
                variant="ghost"
                className="justify-start text-red-300"
                onClick={() => editor.deleteSelection()}
            >
                <Trash2 /> Delete cable
            </Button>
        </>
    );
}
