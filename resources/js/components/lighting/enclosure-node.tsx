import { useViewport } from '@xyflow/react';
import type { Node, NodeProps } from '@xyflow/react';
import { mmToCanvas } from './geometry';
import type { LightingDesign } from './types';

export type PhysicalEnclosureNode = Node<
    { design: LightingDesign; showGrid: boolean },
    'enclosure'
>;

export default function EnclosureNode({
    data,
}: NodeProps<PhysicalEnclosureNode>) {
    const { zoom } = useViewport();
    const { design, showGrid } = data;
    const step = mmToCanvas(design.grid_size_mm);
    const rulerStep = Math.max(
        50,
        Math.ceil(Math.max(design.width_mm, design.height_mm) / 20 / 50) * 50,
    );
    const horizontalMarks = Array.from(
        { length: Math.floor(design.width_mm / rulerStep) + 1 },
        (_, index) => index * rulerStep,
    );
    const verticalMarks = Array.from(
        { length: Math.floor(design.height_mm / rulerStep) + 1 },
        (_, index) => index * rulerStep,
    );

    return (
        <div
            className="pointer-events-none relative h-full w-full border-2 border-foreground/40 bg-card text-foreground shadow-lg"
            data-testid="lighting-enclosure"
            style={
                showGrid
                    ? {
                          backgroundImage: `linear-gradient(to right, color-mix(in srgb, var(--foreground) 12%, transparent) ${0.7 / zoom}px, transparent ${0.7 / zoom}px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 12%, transparent) ${0.7 / zoom}px, transparent ${0.7 / zoom}px)`,
                          backgroundSize: `${step}px ${step}px`,
                      }
                    : undefined
            }
        >
            <div
                className="absolute border-2 border-dashed border-amber-600/65"
                style={{
                    left: mmToCanvas(design.margin_left_mm),
                    top: mmToCanvas(design.margin_top_mm),
                    right: mmToCanvas(design.margin_right_mm),
                    bottom: mmToCanvas(design.margin_bottom_mm),
                }}
            />
            <div
                className="absolute left-0 font-semibold"
                style={{ top: -44 / zoom, fontSize: 12 / zoom }}
            >
                {design.width_mm} × {design.height_mm} mm{' '}
                <span className="font-normal text-muted-foreground">
                    · grid {design.grid_size_mm} mm
                </span>
            </div>
            <div
                className="absolute inset-x-0 border-b border-foreground/50"
                style={{ top: -20 / zoom, height: 18 / zoom }}
            >
                {horizontalMarks.map((mark) => (
                    <span
                        key={mark}
                        className="absolute bottom-0 border-l border-foreground/50 pb-1 pl-1 text-[14px]"
                        style={{ left: mmToCanvas(mark), fontSize: 9 / zoom }}
                    >
                        {mark}
                    </span>
                ))}
            </div>
            <div
                className="absolute inset-y-0 border-r border-foreground/50"
                style={{ left: -32 / zoom, width: 30 / zoom }}
            >
                {verticalMarks.map((mark) => (
                    <span
                        key={mark}
                        className="absolute right-0 border-t border-foreground/50 pt-1 pr-1 text-[14px]"
                        style={{ top: mmToCanvas(mark), fontSize: 9 / zoom }}
                    >
                        {mark}
                    </span>
                ))}
            </div>
        </div>
    );
}
