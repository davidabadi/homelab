import { Tv } from 'lucide-react';
import { Countdown } from '@/components/countdown';
import { MediaRow } from '@/components/media-row';
import { EpisodeWatchButton } from '@/components/media-watch-button';
import { daysBetween, parseDateString } from '@/lib/dates';

/**
 * One row of the Shows › Upcoming feed — a tracked show's episode, shared by the
 * future feed and the aired-but-unwatched backlog above it. Not-yet-aired
 * episodes count down to their air day; aired ones expose the multi-watch
 * toggle (the backlog is exactly these). Purely a wrapper around the shared
 * MediaRow so both surfaces render identically.
 */
export type UpcomingEpisode = {
    id: number;
    show_id: number;
    show_title: string | null;
    show_poster_url: string | null;
    season_number: number;
    episode_number: number;
    title: string | null;
    air_date: string;
    watch_count: number;
};

export function episodeCode(episode: {
    season_number: number;
    episode_number: number;
}): string {
    const season = String(episode.season_number).padStart(2, '0');
    const number = String(episode.episode_number).padStart(2, '0');

    return `S${season} | E${number}`;
}

export function EpisodeRow({
    episode,
    today,
    onOpenEpisode,
    onOpenShow,
    innerRef,
}: {
    episode: UpcomingEpisode;
    today: string;
    onOpenEpisode: () => void;
    onOpenShow: () => void;
    innerRef?: React.Ref<HTMLLIElement>;
}) {
    const showTitle = episode.show_title ?? 'Unknown show';
    const daysUntilAiring = daysBetween(
        parseDateString(today),
        parseDateString(episode.air_date),
    );

    return (
        <MediaRow
            innerRef={innerRef}
            posterUrl={episode.show_poster_url}
            fallbackIcon={Tv}
            pill={{ label: showTitle, onClick: onOpenShow }}
            primary={episodeCode(episode)}
            secondary={episode.title ?? 'TBA'}
            onClick={onOpenEpisode}
            trailing={
                daysUntilAiring > 0 ? (
                    // Not aired yet: nothing to mark watched — count down to
                    // air day instead, mirroring Movies › Upcoming.
                    <Countdown daysUntil={daysUntilAiring} />
                ) : (
                    <EpisodeWatchButton
                        key={`${episode.id}-${episode.watch_count}`}
                        episodeId={episode.id}
                        initialCount={episode.watch_count}
                        label={`${showTitle} ${episodeCode(episode)}`}
                    />
                )
            }
        />
    );
}
