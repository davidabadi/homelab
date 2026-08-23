import { router, useHttp } from '@inertiajs/react';
import { useState } from 'react';
import { toggle as toggleEpisode } from '@/actions/App/Http/Controllers/EpisodeWatchController';
import { toggleWatched as toggleMovie } from '@/actions/App/Http/Controllers/MovieTrackingController';
import { MediaWatchControl } from '@/components/media-watch-control';
import { nextWatchCount } from '@/components/watched-toggle';
import type { WatchAction } from '@/components/watched-toggle';

/**
 * Self-contained multi-watch button for list rows and grids (Watch List,
 * Upcoming): owns the watch count, drives the item-6 action endpoint, and
 * updates optimistically with rollback on failure. Screens that need the count
 * lifted (detail modals, season counters) use MediaWatchControl directly.
 */
function MediaWatchButton({
    url,
    initialCount,
    label,
    onCount,
    onSuccess,
    className,
}: {
    url: string;
    initialCount: number;
    label: string;
    onCount?: (count: number) => void;
    onSuccess?: (count: number) => void;
    className?: string;
}) {
    const [count, setCount] = useState(initialCount);
    const { patch, transform, processing } = useHttp({
        action: 'increment' as WatchAction,
    });

    function apply(action: WatchAction) {
        const previous = count;
        const next = nextWatchCount(count, action);

        setCount(next);
        onCount?.(next);
        // Any prefetched page (nav links prefetch + cache) is now stale.
        router.flushAll();

        transform(() => ({ action }));
        patch(url, {
            onSuccess: () => onSuccess?.(next),
            onError: () => {
                setCount(previous);
                onCount?.(previous);
            },
        });
    }

    return (
        <MediaWatchControl
            count={count}
            label={label}
            onAction={apply}
            disabled={processing}
            className={className}
        />
    );
}

/** Episode variant, keyed by the shared episode id. */
export function EpisodeWatchButton({
    episodeId,
    initialCount,
    label,
    onCount,
    onSuccess,
    className,
}: {
    episodeId: number;
    initialCount: number;
    label: string;
    onCount?: (count: number) => void;
    onSuccess?: (count: number) => void;
    className?: string;
}) {
    return (
        <MediaWatchButton
            url={toggleEpisode.url(episodeId)}
            initialCount={initialCount}
            label={label}
            onCount={onCount}
            onSuccess={onSuccess}
            className={className}
        />
    );
}

/** Movie variant, keyed by the shared movie id. */
export function MovieWatchButton({
    movieId,
    initialCount,
    label,
    onCount,
    className,
}: {
    movieId: number;
    initialCount: number;
    label: string;
    onCount?: (count: number) => void;
    className?: string;
}) {
    return (
        <MediaWatchButton
            url={toggleMovie.url(movieId)}
            initialCount={initialCount}
            label={label}
            onCount={onCount}
            className={className}
        />
    );
}
