import { Input } from '@/components/ui/input';
import { cableLengthMm } from './geometry';
import { NumberField, TextField, NotesField } from './inspector-fields';
import type { PropertiesInspectorProps } from './properties-inspector';
import type { DesignConnection, LightingLayout } from './types';
const conductorColors = [
    { label: 'Brown', value: '#92400e' },
    { label: 'Blue', value: '#2563eb' },
    { label: 'Black', value: '#18181b' },
    { label: 'Green', value: '#16a34a' },
    { label: 'Red', value: '#dc2626' },
    { label: 'Orange', value: '#ea580c' },
    { label: 'Gray', value: '#64748b' },
    { label: 'Purple', value: '#9333ea' },
];

export function WireProperties({
    connection,
    layout,
    onUpdate,
}: {
    connection: DesignConnection;
    layout: LightingLayout;
    onUpdate: PropertiesInspectorProps['onUpdateConnection'];
}) {
    const { definitions } = layout;
    function endpointLabel(componentId: string, terminalKey: string): string {
        const placed = layout.components.find(
            (item) => item.portable_id === componentId,
        );
        const catalog = definitions.find(
            (item) => item.id === placed?.component_definition_id,
        );
        const terminal = catalog?.terminals.find(
            (item) => item.key === terminalKey,
        );

        return `${placed?.custom_label || catalog?.display_name || 'Device'} · ${terminal?.label || terminalKey}`;
    }

    return (
        <>
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3">
                <div>
                    <p className="text-[10px] text-muted-foreground">From</p>
                    <p className="mt-0.5 text-xs font-medium">
                        {endpointLabel(
                            connection.source_portable_id,
                            connection.source_terminal,
                        )}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-muted-foreground">To</p>
                    <p className="mt-0.5 text-xs font-medium">
                        {endpointLabel(
                            connection.target_portable_id,
                            connection.target_terminal,
                        )}
                    </p>
                </div>
            </div>
            <TextField
                label="Cable type"
                value={connection.cable_type}
                onChange={(value) =>
                    onUpdate(connection.portable_id, {
                        cable_type: value ?? '',
                    })
                }
            />
            <div className="grid grid-cols-2 gap-3">
                <TextField
                    label="Gauge"
                    value={connection.gauge}
                    onChange={(gauge) =>
                        onUpdate(connection.portable_id, { gauge })
                    }
                    placeholder="1.5 mm²"
                />
                <NumberField
                    label="Conductors"
                    min={1}
                    max={100}
                    value={connection.conductor_count}
                    onChange={(value) =>
                        value !== null &&
                        Number.isInteger(value) &&
                        onUpdate(connection.portable_id, {
                            conductor_count: value,
                        })
                    }
                />
            </div>
            <div className="grid grid-cols-[1fr_40px] gap-2">
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                    Conductor color
                    <select
                        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                        value={connection.color ?? ''}
                        onChange={(event) =>
                            onUpdate(connection.portable_id, {
                                color: event.target.value || null,
                            })
                        }
                    >
                        <option value="">Unspecified</option>
                        {conductorColors.map((color) => (
                            <option key={color.value} value={color.value}>
                                {color.label}
                            </option>
                        ))}
                        {connection.color &&
                            !conductorColors.some(
                                (color) => color.value === connection.color,
                            ) && (
                                <option value={connection.color}>
                                    Custom ({connection.color})
                                </option>
                            )}
                    </select>
                </label>
                <label className="grid gap-1.5 text-xs text-muted-foreground">
                    <span className="sr-only">Custom conductor color</span>
                    <span aria-hidden="true">Custom</span>
                    <Input
                        type="color"
                        value={connection.color ?? '#64748b'}
                        className="h-8 cursor-pointer p-1"
                        onChange={(event) =>
                            onUpdate(connection.portable_id, {
                                color: event.target.value,
                            })
                        }
                    />
                </label>
            </div>
            <div className="rounded-lg border bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">
                    Estimated routed length
                </p>
                <p className="mt-1 font-mono text-xl font-semibold">
                    {(cableLengthMm(connection.route_points) / 1000).toFixed(3)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                        m
                    </span>
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                    Polyline estimate, before slack or service loops.
                </p>
            </div>
            <NumberField
                label="Actual cable length (mm, optional)"
                value={connection.actual_length_mm}
                min={0}
                nullable
                onChange={(actual_length_mm) =>
                    onUpdate(connection.portable_id, { actual_length_mm })
                }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
                Select the wire on the canvas to move its route handles.
                Double-click a segment dot to add bends.
            </p>
            <NotesField
                value={connection.notes}
                onChange={(notes) =>
                    onUpdate(connection.portable_id, { notes })
                }
            />
        </>
    );
}
