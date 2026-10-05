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
                className={cn(
                    'h-full w-full object-contain mix-blend-multiply',
                    className,
                )}
                onError={() =>
                    setFailedSources((current) => [...current, source])
                }
            />
        );
    }

    return (
        <div
            className={cn(
                'flex h-full w-full items-center justify-center overflow-hidden',
                className,
            )}
            role="img"
            aria-label={`${definition.manufacturer} ${definition.model}, ${definition.category}`}
        >
            <div
                aria-hidden="true"
                className="relative flex h-[85%] max-h-32 min-h-10 w-[65%] max-w-24 flex-col items-center justify-center gap-3 rounded-md border border-slate-400/60 bg-gradient-to-b from-slate-100 to-slate-300 shadow-[2px_3px_0_0_#b6bcc5]"
            >
                <div className="absolute inset-x-2 top-2 h-2 rounded-sm bg-slate-600/70" />
                <CircuitBoard className="size-7 text-slate-500" />
                <div className="absolute inset-x-2 bottom-2 flex gap-1">
                    {[0, 1, 2, 3].map((slot) => (
                        <span
                            key={slot}
                            className="h-2 flex-1 rounded-xs bg-slate-500/60"
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
