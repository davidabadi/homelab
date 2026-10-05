import { Handle, Position, useViewport } from '@xyflow/react';
import { mmToCanvas, rotatePoint } from './geometry';
import type { ComponentDefinition, TerminalDefinition } from './types';

const positions = [
    Position.Top,
    Position.Right,
    Position.Bottom,
    Position.Left,
];
const sides = ['top', 'right', 'bottom', 'left'];

export default function TerminalHandle({
    terminal,
    definition,
    rotation,
    componentId,
}: {
    terminal: TerminalDefinition;
    definition: ComponentDefinition;
    rotation: number;
    componentId: string;
}) {
    const { zoom } = useViewport();
    const point = rotatePoint(
        terminal,
        definition.width_mm,
        definition.height_mm,
        rotation,
    );
    const side = positions[(sides.indexOf(terminal.side) + rotation / 90) % 4];
    const size = Math.max(10, 9 / zoom);

    return (
        <Handle
            id={terminal.key}
            type="source"
            position={side}
            title={`${terminal.label}${terminal.purpose ? ` — ${terminal.purpose}` : ''}`}
            aria-label={`Terminal ${terminal.label}`}
            data-terminal={terminal.key}
            data-testid={`lighting-terminal-${componentId}-${terminal.key}`}
            className="border-2! border-background! bg-primary!"
            style={{
                left: mmToCanvas(point.x_mm),
                top: mmToCanvas(point.y_mm),
                right: 'auto',
                bottom: 'auto',
                width: size,
                height: size,
                transform: 'translate(-50%, -50%)',
            }}
        />
    );
}
