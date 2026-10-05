import { ArrowLeft, ArrowRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ComponentImage } from './component-image';
import { NotesField, ReadOnlyValue } from './inspector-fields';
import type {
    ComponentDefinition,
    LightingLayout,
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
}: {
    component: PlacedComponent;
    definition: ComponentDefinition;
    layout?: LightingLayout;
    onUpdate: (id: string, patch: Partial<PlacedComponent>) => void;
    onDuplicate: (id: string) => void;
    onDetach?: (id: string) => void;
    onMove?: (id: string, rowId: string) => void;
    onReorder?: (id: string, direction: -1 | 1) => void;
}) {
    const rows = [...(layout?.rails ?? [])].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const items = (layout?.components ?? [])
        .filter((item) => item.rail_portable_id === component.rail_portable_id)
        .sort(
            (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
        );
    const index = items.findIndex(
        (item) => item.portable_id === component.portable_id,
    );

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
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={index <= 0}
                                onClick={() =>
                                    onReorder(component.portable_id, -1)
                                }
                            >
                                <ArrowLeft /> Move left
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={index >= items.length - 1}
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
            <details className="rounded-lg border border-white/10 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-300">
                    Terminals ({definition.terminals.length})
                </summary>
                <div className="mt-3 grid gap-2">
                    {definition.terminals.length === 0 && (
                        <p className="text-xs text-slate-500">
                            No terminals in this catalog revision.
                        </p>
                    )}
                    {definition.terminals.map((terminal) => (
                        <div
                            key={terminal.key}
                            className="flex justify-between gap-3 rounded bg-white/5 px-2 py-1.5 text-xs"
                        >
                            <span className="font-medium text-slate-300">
                                {terminal.label}
                            </span>
                            <span className="text-slate-500">
                                {terminal.purpose || terminal.side}
                            </span>
                        </div>
                    ))}
                </div>
            </details>
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
