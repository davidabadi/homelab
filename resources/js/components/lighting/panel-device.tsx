import { GripVertical } from 'lucide-react';
import type { PointerEvent } from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ComponentImage } from './component-image';
import type { ComponentDefinition, PlacedComponent } from './types';

export function PanelDevice({
    component,
    definition,
    index,
    selected,
    width,
    preview = false,
    dragging = false,
    onSelect,
    onPointerDown,
    onNudge,
}: {
    component: PlacedComponent;
    definition: ComponentDefinition;
    index: number;
    selected: boolean;
    width?: number;
    preview?: boolean;
    dragging?: boolean;
    onSelect: () => void;
    onPointerDown?: (
        event: PointerEvent<HTMLButtonElement>,
        id: string,
    ) => void;
    onNudge?: (direction: -1 | 1) => void;
}) {
    const renderedWidth =
        width ?? Math.min(252, Math.max(140, 116 + definition.width_mm * 1.15));
    const compact = renderedWidth < 96;
    const narrow = renderedWidth < 42;
    const label = component.custom_label ?? definition.display_name;
    const button = (
        <button
            type="button"
            draggable={false}
            tabIndex={preview ? -1 : undefined}
            aria-hidden={preview || undefined}
            className={cn(
                'group relative flex shrink-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#242830] text-left shadow-[0_5px_12px_#0003] transition-[border-color,box-shadow] hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400',
                onPointerDown &&
                    'cursor-grab touch-none active:cursor-grabbing',
                selected &&
                    'border-blue-400 shadow-[0_0_22px_#3b82f620] ring-2 ring-blue-400/70',
                narrow && 'rounded-sm',
                dragging && 'opacity-25',
                preview &&
                    'pointer-events-none border-blue-300/80 shadow-[0_0_20px_#3b82f640]',
            )}
            style={{ width: renderedWidth }}
            aria-label={`Select ${label}`}
            aria-pressed={selected}
            data-testid={
                preview
                    ? undefined
                    : `lighting-component-${component.portable_id}`
            }
            data-component-id={preview ? undefined : component.portable_id}
            data-row-id={
                preview ? undefined : (component.rail_portable_id ?? '')
            }
            data-x-mm={preview ? undefined : component.x_mm}
            data-order={preview ? undefined : (component.sort_order ?? index)}
            onClick={onSelect}
            onPointerDown={(event) =>
                onPointerDown?.(event, component.portable_id)
            }
            onKeyDown={(event) => {
                if (
                    onNudge &&
                    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
                ) {
                    event.preventDefault();
                    onNudge(event.key === 'ArrowLeft' ? -1 : 1);
                }
            }}
        >
            <div
                className={cn(
                    'relative flex h-26 items-center justify-center bg-[#e7e9ed]',
                    narrow ? 'p-0.5' : compact ? 'p-1.5' : 'p-3',
                )}
            >
                <ComponentImage
                    definition={definition}
                    className="max-h-full max-w-full"
                />
                {!compact && definition.mounting_type === 'din-rail' && (
                    <GripVertical
                        aria-hidden="true"
                        className="absolute top-2 right-1.5 size-4 text-slate-500 opacity-50 transition-opacity group-hover:opacity-100"
                    />
                )}
            </div>
            <div
                className={cn(
                    'flex h-20 flex-col gap-1 border-t border-white/10 py-2',
                    narrow ? 'items-center px-0' : compact ? 'px-1.5' : 'px-3',
                )}
            >
                {narrow ? (
                    <span
                        aria-hidden="true"
                        className="text-[11px] leading-5 font-semibold text-slate-300"
                    >
                        {index + 1}
                    </span>
                ) : (
                    <>
                        <span
                            className={cn(
                                'font-semibold text-slate-50',
                                compact
                                    ? 'line-clamp-3 text-xs leading-4'
                                    : component.custom_label
                                      ? 'min-h-5 truncate text-sm leading-5'
                                      : 'line-clamp-2 min-h-10 text-sm leading-5',
                            )}
                        >
                            {label}
                        </span>
                        {!compact && (
                            <span
                                className={cn(
                                    'text-xs leading-4 text-slate-400',
                                    component.custom_label
                                        ? 'line-clamp-2'
                                        : 'truncate',
                                )}
                            >
                                {component.custom_label
                                    ? definition.display_name
                                    : `${definition.manufacturer} · ${definition.width_mm} mm`}
                            </span>
                        )}
                    </>
                )}
            </div>
        </button>
    );

    return preview ? (
        button
    ) : (
        <Tooltip
            delayDuration={300}
            disableHoverableContent
            open={dragging ? false : undefined}
        >
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent className="lighting-editor-overlay dark pointer-events-none max-w-72">
                <p className="font-semibold">{label}</p>
                <p className="mt-1 opacity-75">
                    {definition.display_name} · {definition.width_mm} mm
                </p>
            </TooltipContent>
        </Tooltip>
    );
}
