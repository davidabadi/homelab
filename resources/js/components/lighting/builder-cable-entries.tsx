import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import {
    cableEntrySideLength,
    clampCableEntryOffset,
} from './external-cabling';
import type { CableEntry, LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';

export function BuilderCableEntries({
    layout,
    editor,
}: {
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    const container = useRef<HTMLDivElement>(null);

    function drag(
        event: ReactPointerEvent<HTMLButtonElement>,
        entry: CableEntry,
    ) {
        if (event.button !== 0 || !container.current) {
            return;
        }

        event.stopPropagation();
        event.preventDefault();
        editor.setSelection({ type: 'cable_entry', id: entry.portable_id });
        const bounds = container.current.getBoundingClientRect();
        const horizontal = entry.side === 'top' || entry.side === 'bottom';
        const origin = horizontal ? event.clientX : event.clientY;
        const sideLength = cableEntrySideLength(entry, layout.design);
        let offset = entry.offset_mm;
        let moved = false;

        function move(pointer: PointerEvent) {
            const delta =
                (horizontal ? pointer.clientX : pointer.clientY) - origin;

            if (!moved && Math.abs(delta) < 3) {
                return;
            }

            moved = true;
            offset = clampCableEntryOffset(
                {
                    ...entry,
                    offset_mm:
                        entry.offset_mm +
                        (delta * sideLength) /
                            (horizontal ? bounds.width : bounds.height),
                },
                layout.design,
            );
            editor.changeLayout(
                {
                    ...layout,
                    cable_entries: layout.cable_entries.map((item) =>
                        item.portable_id === entry.portable_id
                            ? { ...item, offset_mm: offset }
                            : item,
                    ),
                },
                false,
            );
        }

        function cancel(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish({ type: 'pointercancel' });
            }
        }

        function finish(pointer: Pick<PointerEvent, 'type'>) {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            window.removeEventListener('keydown', cancel);

            if (moved) {
                editor.changeLayout(
                    pointer.type === 'pointercancel'
                        ? layout
                        : {
                              ...layout,
                              cable_entries: layout.cable_entries.map((item) =>
                                  item.portable_id === entry.portable_id
                                      ? { ...item, offset_mm: offset }
                                      : item,
                              ),
                          },
                    pointer.type !== 'pointercancel',
                    pointer.type !== 'pointercancel',
                );
            }
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        window.addEventListener('keydown', cancel);
    }

    return (
        <div
            ref={container}
            className="pointer-events-none absolute inset-0 z-10"
        >
            {layout.cable_entries.map((entry) => {
                const horizontal =
                    entry.side === 'top' || entry.side === 'bottom';
                const length = cableEntrySideLength(entry, layout.design);
                const selected =
                    editor.selection?.type === 'cable_entry' &&
                    editor.selection.id === entry.portable_id;

                return (
                    <button
                        key={entry.portable_id}
                        type="button"
                        aria-label={`Cable entry ${entry.label}`}
                        title={`${entry.label} · ${entry.side} · drag along edge`}
                        data-testid={`lighting-cable-entry-${entry.portable_id}`}
                        data-side={entry.side}
                        data-offset-mm={entry.offset_mm}
                        className={cn(
                            'group pointer-events-auto absolute touch-none rounded border shadow-[0_1px_5px_#0008] transition-colors',
                            selected
                                ? 'border-blue-300 bg-blue-400'
                                : 'border-slate-400 bg-[#303947] hover:border-blue-300',
                            horizontal
                                ? 'h-3 min-w-5 cursor-ew-resize'
                                : 'min-h-5 w-3 cursor-ns-resize',
                        )}
                        style={
                            horizontal
                                ? {
                                      left: `${(entry.offset_mm / length) * 100}%`,
                                      width: `${(entry.span_mm / length) * 100}%`,
                                      [entry.side]: -5,
                                  }
                                : {
                                      top: `${(entry.offset_mm / length) * 100}%`,
                                      height: `${(entry.span_mm / length) * 100}%`,
                                      [entry.side]: -5,
                                  }
                        }
                        onPointerDown={(event) => drag(event, entry)}
                        onClick={(event) => {
                            event.stopPropagation();
                            editor.setSelection({
                                type: 'cable_entry',
                                id: entry.portable_id,
                            });
                        }}
                        onKeyDown={(event) => {
                            const direction =
                                event.key === 'ArrowLeft' ||
                                event.key === 'ArrowUp'
                                    ? -1
                                    : event.key === 'ArrowRight' ||
                                        event.key === 'ArrowDown'
                                      ? 1
                                      : 0;

                            if (direction) {
                                event.preventDefault();
                                editor.updateCableEntry(entry.portable_id, {
                                    offset_mm: clampCableEntryOffset(
                                        {
                                            ...entry,
                                            offset_mm:
                                                entry.offset_mm +
                                                direction *
                                                    layout.design.grid_size_mm,
                                        },
                                        layout.design,
                                    ),
                                });
                            }
                        }}
                    >
                        <span
                            className={cn(
                                'pointer-events-none absolute z-10 rounded border border-white/15 bg-[#1b222d] px-2 py-1 text-xs whitespace-nowrap text-slate-200 shadow-lg',
                                selected
                                    ? 'block'
                                    : 'hidden group-hover:block group-focus-visible:block',
                                horizontal
                                    ? 'left-1/2 -translate-x-1/2'
                                    : 'top-1/2 -translate-y-1/2',
                                entry.side === 'top'
                                    ? 'bottom-full mb-2'
                                    : entry.side === 'bottom'
                                      ? 'top-full mt-2'
                                      : entry.side === 'left'
                                        ? 'left-full ml-2'
                                        : 'right-full mr-2',
                            )}
                        >
                            {entry.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
