import { Copy, Link2Off } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    NumberField,
    TextField,
    NotesField,
    ReadOnlyValue,
} from './inspector-fields';
import type { PropertiesInspectorProps } from './properties-inspector';
import type { PlacedComponent, ComponentDefinition } from './types';
export function DeviceProperties({
    component,
    definition,
    onUpdate,
    onDuplicate,
    onDetach,
}: {
    component: PlacedComponent;
    definition: ComponentDefinition;
    onUpdate: PropertiesInspectorProps['onUpdateComponent'];
    onDuplicate: PropertiesInspectorProps['onDuplicateComponent'];
    onDetach: PropertiesInspectorProps['onDetachComponent'];
}) {
    return (
        <>
            <div className="grid gap-1">
                <p className="text-sm font-semibold">
                    {definition.display_name}
                </p>
                <p className="text-xs text-muted-foreground">
                    {definition.manufacturer} · {definition.model} · rev{' '}
                    {definition.revision}
                </p>
                {(definition.metadata.sample_dimensions === true ||
                    definition.metadata.dimensions_status === 'sample') && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        Sample dimensions. Verify before fabrication.
                    </p>
                )}
            </div>
            <TextField
                label="Custom label"
                value={component.custom_label}
                onChange={(custom_label) =>
                    onUpdate(component.portable_id, {
                        custom_label,
                    })
                }
                placeholder={definition.display_name}
            />
            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="X (mm)"
                    value={component.x_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(component.portable_id, { x_mm: value })
                    }
                />
                <NumberField
                    label="Y (mm)"
                    value={component.y_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(component.portable_id, { y_mm: value })
                    }
                />
            </div>
            <dl className="grid gap-2 rounded-lg border bg-muted/20 p-3">
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
                <ReadOnlyValue
                    label="Mounting"
                    value={definition.mounting_type}
                />
                {definition.din_modules !== null && (
                    <ReadOnlyValue
                        label="DIN modules"
                        value={definition.din_modules}
                    />
                )}
            </dl>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
                Rotation
                <select
                    value={component.rotation}
                    className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                    disabled={component.rail_portable_id !== null}
                    onChange={(event) =>
                        onUpdate(component.portable_id, {
                            rotation: Number(event.target.value),
                        })
                    }
                >
                    {[0, 90, 180, 270].map((angle) => (
                        <option key={angle} value={angle}>
                            {angle}°
                        </option>
                    ))}
                </select>
            </label>
            {component.rail_portable_id && (
                <div className="grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-xs text-muted-foreground">
                        Attached to a DIN rail. Drag horizontally to slide along
                        it.
                    </p>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDetach(component.portable_id)}
                    >
                        <Link2Off /> Detach from rail
                    </Button>
                </div>
            )}
            <div className="grid gap-2">
                <h3 className="text-xs font-semibold">
                    Terminals ({definition.terminals.length})
                </h3>
                {definition.metadata.sample_terminal_positions === true && (
                    <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
                        Terminal positions are schematic samples. Check the
                        product datasheet before fabrication.
                    </p>
                )}
                {definition.terminals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        No terminals defined for this catalog revision.
                    </p>
                ) : (
                    <ul className="grid gap-1.5">
                        {definition.terminals.map((terminal) => (
                            <li
                                key={terminal.key}
                                className="flex justify-between gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs"
                            >
                                <span className="font-mono font-medium">
                                    {terminal.label}
                                </span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                    {terminal.purpose || terminal.side}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <NotesField
                value={component.notes}
                onChange={(notes) =>
                    onUpdate(component.portable_id, {
                        notes,
                    })
                }
            />
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
