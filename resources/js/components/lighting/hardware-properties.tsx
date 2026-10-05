import { NumberField, ReadOnlyValue } from './inspector-fields';
import type { PropertiesInspectorProps } from './properties-inspector';
import type { DesignRail, DesignDuct, PlacedComponent } from './types';
export function RailProperties({
    rail,
    components,
    onUpdate,
}: {
    rail: DesignRail;
    components: PlacedComponent[];
    onUpdate: PropertiesInspectorProps['onUpdateRail'];
}) {
    return (
        <>
            <p className="text-xs leading-relaxed text-muted-foreground">
                Attached DIN devices move with this rail. Its physical length
                controls the available mounting space.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="X (mm)"
                    value={rail.x_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(rail.portable_id, {
                            x_mm: value,
                        })
                    }
                />
                <NumberField
                    label="Y (mm)"
                    value={rail.y_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(rail.portable_id, {
                            y_mm: value,
                        })
                    }
                />
            </div>
            <NumberField
                label="Rail length (mm)"
                value={rail.length_mm}
                min={1}
                onChange={(value) =>
                    value !== null &&
                    onUpdate(rail.portable_id, {
                        length_mm: value,
                    })
                }
            />
            <NumberField
                label="Rail width (mm)"
                value={rail.width_mm}
                min={1}
                onChange={(value) =>
                    value !== null &&
                    onUpdate(rail.portable_id, {
                        width_mm: value,
                    })
                }
            />
            <ReadOnlyValue
                label="Attached devices"
                value={
                    components.filter(
                        (item) => item.rail_portable_id === rail.portable_id,
                    ).length
                }
            />
        </>
    );
}
export function DuctProperties({
    duct,
    onUpdate,
}: {
    duct: DesignDuct;
    onUpdate: PropertiesInspectorProps['onUpdateDuct'];
}) {
    return (
        <>
            <label className="grid gap-1.5 text-xs text-muted-foreground">
                Orientation
                <select
                    value={duct.orientation}
                    className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
                    onChange={(event) =>
                        onUpdate(duct.portable_id, {
                            orientation: event.target
                                .value as DesignDuct['orientation'],
                        })
                    }
                >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="X (mm)"
                    value={duct.x_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(duct.portable_id, {
                            x_mm: value,
                        })
                    }
                />
                <NumberField
                    label="Y (mm)"
                    value={duct.y_mm}
                    onChange={(value) =>
                        value !== null &&
                        onUpdate(duct.portable_id, {
                            y_mm: value,
                        })
                    }
                />
            </div>
            <NumberField
                label="Duct length (mm)"
                value={duct.length_mm}
                min={1}
                onChange={(value) =>
                    value !== null &&
                    onUpdate(duct.portable_id, {
                        length_mm: value,
                    })
                }
            />
            <NumberField
                label="Duct width (mm)"
                value={duct.width_mm}
                min={1}
                onChange={(value) =>
                    value !== null &&
                    onUpdate(duct.portable_id, {
                        width_mm: value,
                    })
                }
            />
        </>
    );
}
