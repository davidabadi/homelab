import { Film, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfileMedia } from '@/types';

export function ProfileMediaPoster({
    media,
    kind,
    onOpen,
    className,
    progress,
    progressClassName,
}: {
    media: ProfileMedia;
    kind: 'show' | 'movie';
    onOpen: () => void;
    className?: string;
    progress?: { percentage: number; visible: boolean };
    progressClassName?: string;
}) {
    const FallbackIcon = kind === 'show' ? Tv : Film;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${media.title} details`}
            className={cn(
                'group relative aspect-2/3 overflow-hidden rounded-lg bg-muted text-left ring-offset-background transition-[transform,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:hover:-translate-y-0.5',
                className,
            )}
        >
            {media.poster_url ? (
                <img
                    src={media.poster_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover transition-opacity group-hover:opacity-85"
                />
            ) : (
                <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                    <FallbackIcon className="size-6 text-muted-foreground" />
                    <span className="line-clamp-3 text-xs font-medium text-muted-foreground">
                        {media.title}
                    </span>
                </span>
            )}

            {progress?.visible && (
                <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-1.5 bg-black/55"
                >
                    <span
                        className={cn(
                            'block h-full transition-[width] motion-reduce:transition-none',
                            progressClassName,
                        )}
                        style={{
                            width: `${Math.min(100, Math.max(0, progress.percentage))}%`,
                        }}
                    />
                </span>
            )}
        </button>
    );
}
