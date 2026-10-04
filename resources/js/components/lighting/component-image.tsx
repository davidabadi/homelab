import { CircuitBoard } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ComponentDefinition } from './types';

export function ComponentImage({
    definition,
    className,
}: {
    definition: ComponentDefinition;
    className?: string;
}) {
    const [failedSources, setFailedSources] = useState<string[]>([]);
    const source = [definition.local_image_url, definition.image_url].find(
        (url) => url && !failedSources.includes(url),
    );

    if (source) {
        return (
            <img
                src={source}
                alt={definition.display_name}
                draggable={false}
                className={cn('h-full w-full object-contain', className)}
                onError={() =>
                    setFailedSources((current) => [...current, source])
                }
            />
        );
    }

    return (
        <div
            className={cn(
                'flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden bg-muted p-1 text-center',
                className,
            )}
            role="img"
            aria-label={`${definition.manufacturer} ${definition.model}, ${definition.category}`}
        >
            <CircuitBoard
                aria-hidden="true"
                className="size-5 shrink-0 text-muted-foreground/60"
            />
            <span className="max-w-full truncate text-[9px] leading-tight font-semibold">
                {definition.manufacturer}
            </span>
            <span className="max-w-full truncate text-[9px] leading-tight text-muted-foreground">
                {definition.model}
            </span>
            <span className="max-w-full truncate text-[8px] leading-tight text-muted-foreground">
                {definition.category}
            </span>
        </div>
    );
}
