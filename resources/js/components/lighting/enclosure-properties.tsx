import { NumberField, NotesField } from './inspector-fields';
import type { PropertiesInspectorProps } from './properties-inspector';
import type { LightingDesign } from './types';
export function EnclosureProperties({
    design,
    onUpdate,
}: {
    design: LightingDesign;
    onUpdate: PropertiesInspectorProps['onUpdateDesign'];
}) {
    return (
        <>
            <p className="text-xs leading-relaxed text-muted-foreground">
                All dimensions and positions are in millimeters. Select an
                object on the canvas to inspect it.
            </p>
            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="Enclosure width (mm)"
                    value={design.width_mm}
                    min={1}
                    max={10000}
                    onChange={(value) =>
                        value !== null && onUpdate({ width_mm: value })
                    }
                />
                <NumberField
                    label="Enclosure height (mm)"
                    value={design.height_mm}
                    min={1}
                    max={10000}
                    onChange={(value) =>
                        value !== null && onUpdate({ height_mm: value })
                    }
                />
            </div>
            <NumberField
                label="Enclosure depth (mm, optional)"
                value={design.depth_mm}
                min={1}
                nullable
                onChange={(depth_mm) => onUpdate({ depth_mm })}
            />
            <NumberField
                label="Grid spacing (mm)"
                value={design.grid_size_mm}
                min={0.1}
                max={100}
                onChange={(value) =>
                    value !== null && onUpdate({ grid_size_mm: value })
                }
            />
            <div className="grid gap-2">
                <h3 className="text-xs font-semibold">Mounting margins (mm)</h3>
                <div className="grid grid-cols-2 gap-3">
                    {(['top', 'right', 'bottom', 'left'] as const).map(
                        (side) => {
                            const field = `margin_${side}_mm` as const;

                            return (
                                <NumberField
                                    key={field}
                                    label={
                                        side.charAt(0).toUpperCase() +
                                        side.slice(1)
                                    }
                                    value={design[field]}
                                    min={0}
                                    onChange={(value) =>
                                        value !== null &&
                                        onUpdate({
                                            [field]: value,
                                        })
                                    }
                                />
                            );
                        },
                    )}
                </div>
            </div>
            <NotesField
                value={design.notes}
                onChange={(notes) => onUpdate({ notes })}
            />
        </>
    );
}
