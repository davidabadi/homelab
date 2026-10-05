import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComponentImage } from './component-image';
import type { ComponentDefinition, PlacedComponent } from './types';

export function PanelDevice({
    component,
    definition,
    index,
    selected,
    onSelect,
    onDragStart,
    onDragEnd,
}: {
    component: PlacedComponent;
    definition: ComponentDefinition;
    index: number;
    selected: boolean;
    onSelect: () => void;
    onDragStart: (id: string) => void;
    onDragEnd: () => void;
}) {
    const width = Math.min(
        252,
        Math.max(140, 116 + definition.width_mm * 1.15),
    );

    return (
        <button
            type="button"
            draggable={definition.mounting_type === 'din-rail'}
            className={cn(
                'group relative flex shrink-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#242830] text-left shadow-[0_5px_12px_#0003] transition-[border-color,box-shadow] hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400',
                selected &&
                    'border-blue-400 shadow-[0_0_22px_#3b82f620] ring-2 ring-blue-400/70',
            )}
            style={{ width }}
            aria-label={`Select ${component.custom_label ?? definition.display_name}`}
            aria-pressed={selected}
            data-testid={`lighting-component-${component.portable_id}`}
            data-component-id={component.portable_id}
            data-row-id={component.rail_portable_id ?? ''}
            data-order={component.sort_order ?? index}
            title={component.custom_label ?? definition.display_name}
            onClick={onSelect}
            onDragStart={(event) => {
                event.dataTransfer.setData(
                    'application/lighting-device',
                    component.portable_id,
                );
                event.dataTransfer.effectAllowed = 'move';
                onDragStart(component.portable_id);
            }}
            onDragEnd={onDragEnd}
        >
            <div className="relative flex h-26 items-center justify-center bg-[#e7e9ed] p-3">
                <ComponentImage
                    definition={definition}
                    className="max-h-full max-w-full"
                />
                {definition.mounting_type === 'din-rail' && (
                    <GripVertical
                        aria-hidden="true"
                        className="absolute top-2 right-1.5 size-4 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                )}
            </div>
            <div className="flex h-20 flex-col gap-1 border-t border-white/10 px-3 py-2">
                <span
                    className={cn(
                        'text-sm leading-5 font-semibold text-slate-50',
                        component.custom_label
                            ? 'min-h-5 truncate'
                            : 'line-clamp-2 min-h-10',
                    )}
                >
                    {component.custom_label ?? definition.display_name}
                </span>
                <span
                    className={cn(
                        'text-xs leading-4 text-slate-400',
                        component.custom_label ? 'line-clamp-2' : 'truncate',
                    )}
                    title={
                        component.custom_label
                            ? definition.display_name
                            : definition.model
                    }
                >
                    {component.custom_label
                        ? definition.display_name
                        : `${definition.manufacturer} · ${definition.width_mm} mm`}
                </span>
            </div>
        </button>
    );
}
