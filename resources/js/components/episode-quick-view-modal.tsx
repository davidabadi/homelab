import { router, useHttp } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toggle as toggleEpisodeWatched } from '@/actions/App/Http/Controllers/EpisodeWatchController';
import { EpisodeQuickView, episodeCode } from '@/components/episode-quick-view';
import type { QuickViewEpisode } from '@/components/episode-quick-view';
import { MediaWatchControl } from '@/components/media-watch-control';
import { nextWatchCount } from '@/components/watched-toggle';
import type { WatchAction } from '@/components/watched-toggle';
import { show as episodeShow } from '@/routes/episodes';

type EpisodeQuickViewPayload = {
    episode: QuickViewEpisode;
    show: { id: number; title: string | null };
    watched: boolean;
    watchCount: number;
    watchedDate: string | null;
    previousId: number | null;
    nextId: number | null;
    position: number | null;
    total: number;
};

function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Standalone Episode Quick View, opened from screens that only know an
 * episode id (Shows › Upcoming): fetches each episode's payload as the user
 * browses previous/next, and reports on close whether anything changed so the
 * hosting screen can refresh.
 */
export function EpisodeQuickViewModal({
    episodeId,
    onClose,
}: {
    episodeId: number;
    onClose: (dirty: boolean) => void;
}) {
    const [currentId, setCurrentId] = useState(episodeId);
    const [data, setData] = useState<EpisodeQuickViewPayload | null>(null);
    const [watchCount, setWatchCount] = useState(0);
    const [watchedDate, setWatchedDate] = useState<string | null>(null);
    // Kept across navigations (unlike `data`, which clears while the next
    // episode loads) so the position dots stay mounted and animate the move.
    const [dots, setDots] = useState<{
        position: number | null;
        total: number | null;
    }>({ position: null, total: null });

    const dirty = useRef(false);

    const { get } = useHttp({});
    const toggleHttp = useHttp({ action: 'increment' as WatchAction });

    useEffect(() => {
        get(episodeShow.url(currentId), {
            onSuccess: (response) => {
                const payload = response as EpisodeQuickViewPayload;

                setData(payload);
                setWatchCount(payload.watchCount);
                setWatchedDate(payload.watchedDate);
                setDots({
                    position: payload.position,
                    total: payload.total,
                });
            },
            onHttpException: () => onClose(dirty.current),
            onNetworkError: () => onClose(dirty.current),
        });
        // Refetch only when browsing to another episode.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentId]);

    function handleWatchAction(action: WatchAction) {
        if (toggleHttp.processing || !data) {
            return;
        }

        const previousCount = watchCount;
        const previousDate = watchedDate;
        const next = nextWatchCount(watchCount, action);

        dirty.current = true;
        setWatchCount(next);
        setWatchedDate(next > 0 ? (watchedDate ?? localToday()) : null);
        router.flushAll();

        toggleHttp.transform(() => ({ action }));
        toggleHttp.patch(toggleEpisodeWatched.url(currentId), {
            onError: () => {
                setWatchCount(previousCount);
                setWatchedDate(previousDate);
            },
        });
    }

    function handleNavigate(direction: 'previous' | 'next') {
        const targetId =
            direction === 'previous' ? data?.previousId : data?.nextId;

        if (targetId != null) {
            // Clear the current payload so the skeleton shows while loading.
            setData(null);
            setCurrentId(targetId);
        }
    }

    return (
        <EpisodeQuickView
            open
            onOpenChange={(open) => {
                if (!open) {
                    onClose(dirty.current);
                }
            }}
            episode={data?.episode ?? null}
            showTitle={data?.show.title}
            watched={watchCount > 0}
            watchCount={watchCount}
            watchedDate={watchedDate}
            toggle={
                <MediaWatchControl
                    count={watchCount}
                    label={data ? episodeCode(data.episode) : 'episode'}
                    onAction={handleWatchAction}
                    disabled={toggleHttp.processing}
                />
            }
            hasPrevious={data?.previousId != null}
            hasNext={data?.nextId != null}
            onNavigate={handleNavigate}
            position={dots.position}
            total={dots.total}
        />
    );
}
