import { Tv } from 'lucide-react';
import { MediaRow } from '@/components/media-row';
import type { RowBadgeTone, RowSwipe } from '@/components/media-row';
import { EpisodeWatchButton } from '@/components/media-watch-button';
import { WatchedToggle } from '@/components/watched-toggle';

type RowEpisode = {
    id: number;
    season_number: number;
    episode_number: number;
    title: string | null;
    air_date: string | null;
    watch_count: number;
};

/** A show's list status, insofar as the swipe status menu cares (spec Part 2 §2). */
export type ShowRowStatus = 'watching' | 'watch_later' | 'finished' | 'stopped';

export type ShowWatchRowData = {
    show_id: number;
    show_title: string | null;
    show_poster_url: string | null;
    section: string;
    // The show's own list status + whether it has any watched episode; together
    // these pick the left-swipe menu's options. Null on Watched History rows,
    // which aren't swipeable.
    status: ShowRowStatus | null;
    has_progress: boolean;
    remaining: number;
    last_watched_at: string | null;
    badge: RowBadgeTone | null;
    episode: RowEpisode | null;
    next_episode: RowEpisode | null;
};

const BADGE_LABELS: Record<RowBadgeTone, string> = {
    new: 'New',
    premiere: 'Premiere',
    latest: 'Latest',
};

function episodeCode(episode: {
    season_number: number;
    episode_number: number;
}): string {
    const season = String(episode.season_number).padStart(2, '0');
    const number = String(episode.episode_number).padStart(2, '0');

    return `S${season} | E${number}`;
}

/**
 * One Shows Watch List row (spec §5): the shared media row wired to a show's
 * surfaced episode — name pill opens the show, the row opens the episode quick
 * view, and the trailing control marks the surfaced episode watched.
 *
 * Two modes: pass `onMarkWatched` (the main Watch List) to hand the mark off to
 * the parent, which reorders/removes the row with a transition; omit it (the
 * Watch Later list) and the row self-manages via the standard multi-watch
 * button. `innerRef`/`overlay`/`className` let the parent drive those animations.
 */
export function ShowWatchRow({
    row,
    onOpenShow,
    onOpenEpisode,
    onMarkWatched,
    marking = false,
    innerRef,
    overlay,
    className,
    swipe,
    onWatchCount,
    onWatchSuccess,
}: {
    row: ShowWatchRowData;
    onOpenShow: () => void;
    onOpenEpisode: (episodeId: number) => void;
    onMarkWatched?: () => void;
    marking?: boolean;
    innerRef?: React.Ref<HTMLLIElement>;
    overlay?: React.ReactNode;
    className?: string;
    swipe?: RowSwipe;
    onWatchCount?: (count: number) => void;
    onWatchSuccess?: (count: number) => void;
}) {
    const showTitle = row.show_title ?? 'Unknown show';
    const episode = row.episode;

    let trailing: React.ReactNode = <span className="w-11" />;

    if (episode) {
        trailing = onMarkWatched ? (
            <WatchedToggle
                count={episode.watch_count}
                onTap={() => {
                    if (!marking) {
                        onMarkWatched();
                    }
                }}
                label={`${showTitle} ${episodeCode(episode)}`}
            />
        ) : (
            <EpisodeWatchButton
                key={`${episode.id}-${episode.watch_count}`}
                episodeId={episode.id}
                initialCount={episode.watch_count}
                label={`${showTitle} ${episodeCode(episode)}`}
                onCount={onWatchCount}
                onSuccess={onWatchSuccess}
            />
        );
    }

    return (
        <MediaRow
            innerRef={innerRef}
            overlay={overlay}
            className={className}
            posterUrl={row.show_poster_url}
            fallbackIcon={Tv}
            pill={{ label: showTitle, onClick: onOpenShow }}
            primary={episode ? episodeCode(episode) : 'No episodes'}
            primarySuffix={row.remaining > 0 ? `+${row.remaining}` : null}
            secondary={episode ? (episode.title ?? 'TBA') : null}
            badge={
                row.badge
                    ? { label: BADGE_LABELS[row.badge], tone: row.badge }
                    : null
            }
            onClick={episode ? () => onOpenEpisode(episode.id) : undefined}
            trailing={trailing}
            swipe={swipe}
        />
    );
}
