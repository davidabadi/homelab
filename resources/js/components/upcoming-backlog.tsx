import { useHttp } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { Spinner } from '@/components/ui/spinner';
import { EpisodeRow } from '@/components/upcoming-episode-row';
import type { UpcomingEpisode } from '@/components/upcoming-episode-row';
import { formatLongDate, parseDateString } from '@/lib/dates';
import { backlog } from '@/routes/shows/upcoming';

type BacklogResponse = {
    rows: UpcomingEpisode[];
    nextCursor: string | null;
    hasMore: boolean;
};

// Fire the next (older) page once the user scrolls within this many px of the top.
const LOAD_AT = 8;

/** A single air date's episodes, one contiguous section under a date pill. */
type DateGroup = {
    date: string;
    // Sub-groups within the date, one per show, in first-seen order.
    shows: UpcomingEpisode[][];
};

/**
 * Fold the flat, oldest→newest backlog into date sections, and within each date
 * into per-show clusters. A show with more than one episode on the same date
 * (e.g. a season binge-drop) collapses to its first episode + an "N episodes"
 * expander; a single episode renders as a plain row.
 */
function groupByDate(rows: UpcomingEpisode[]): DateGroup[] {
    const groups: DateGroup[] = [];

    for (const row of rows) {
        let group = groups.at(-1);

        if (!group || group.date !== row.air_date) {
            group = { date: row.air_date, shows: [] };
            groups.push(group);
        }

        // Same show as an existing cluster in this date? Append; else start one.
        // Clusters aren't required to be contiguous in the source order, so match
        // by show id across the whole date.
        const cluster = group.shows.find(
            (episodes) => episodes[0].show_id === row.show_id,
        );

        if (cluster) {
            cluster.push(row);
        } else {
            group.shows.push([row]);
        }
    }

    // Order each show's episodes by season/episode so the surfaced (first) one
    // is the earliest, matching the future feed's ordering.
    for (const group of groups) {
        for (const cluster of group.shows) {
            cluster.sort(
                (a, b) =>
                    a.season_number - b.season_number ||
                    a.episode_number - b.episode_number,
            );
        }
    }

    return groups;
}

function clusterKey(episode: UpcomingEpisode): string {
    return `${episode.show_id}|${episode.air_date}`;
}

/**
 * The Shows › Upcoming backlog (spec Part 3): episodes from this user's tracked
 * shows that already aired but they haven't watched, sitting above the future
 * feed. Most-recently-aired nearest the future feed, older entries further up —
 * a chat-log that pages older content upward, mirroring Watched History.
 *
 * The first page loads eagerly on mount but is parked off-screen above the
 * future feed (which fills the viewport), so the initial view is the future
 * feed and the first scroll-up reveals the backlog with no spinner; the spinner
 * only appears once the user pages past that first batch. Older pages prepend
 * with scroll-anchoring so the content under the user's eyes stays put.
 */
export function UpcomingBacklog({
    scrollRef,
    today,
    onOpenEpisode,
    onOpenShow,
}: {
    scrollRef: React.RefObject<HTMLDivElement | null>;
    today: string;
    onOpenEpisode: (episodeId: number) => void;
    onOpenShow: (episode: UpcomingEpisode) => void;
}) {
    const [rows, setRows] = useState<UpcomingEpisode[]>([]);
    const [loading, setLoading] = useState(false);
    // Which same-show/same-date clusters the user has expanded.
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const { get } = useHttp({});

    const cursor = useRef<string | null>(null);
    const hasMore = useRef(true);
    const loadingLock = useRef(false);
    const initialised = useRef(false);
    // scrollHeight captured just before content is added above the fold, to
    // compensate scrollTop after and keep the viewport visually still.
    const anchor = useRef<number | null>(null);

    const loadOlder = useCallback(() => {
        if (loadingLock.current || !hasMore.current) {
            return;
        }

        loadingLock.current = true;
        setLoading(true);

        const query = cursor.current ? { cursor: cursor.current } : {};

        get(backlog.url({ query }), {
            onSuccess: (response) => {
                const payload = response as BacklogResponse;
                const element = scrollRef.current;

                anchor.current = element ? element.scrollHeight : null;

                // Server sends newest-first; reverse so the batch reads
                // oldest→newest top-to-bottom, then prepend older-than-loaded.
                setRows((previous) => [
                    ...[...payload.rows].reverse(),
                    ...previous,
                ]);
                cursor.current = payload.nextCursor;
                hasMore.current = payload.hasMore;
            },
            onError: () => {
                hasMore.current = false;
            },
            onFinish: () => {
                loadingLock.current = false;
                setLoading(false);
            },
        });
    }, [get, scrollRef]);

    // Eager first batch on mount. Passive effect so the ancestor scroller ref is
    // attached; the first prepend's scroll-anchoring (below) parks the future
    // feed at the top, leaving the batch off-screen above.
    useEffect(() => {
        if (initialised.current) {
            return;
        }

        initialised.current = true;
        loadOlder();
    }, [loadOlder]);

    // Compensate scrollTop for content added above the viewport — the eager
    // first batch and every older page prepend at the top.
    useLayoutEffect(() => {
        const element = scrollRef.current;

        if (element && anchor.current !== null) {
            element.scrollTop += element.scrollHeight - anchor.current;
            anchor.current = null;
        }
    }, [rows, scrollRef]);

    useEffect(() => {
        const element = scrollRef.current;

        if (!element) {
            return;
        }

        function onScroll() {
            if (element!.scrollTop <= LOAD_AT) {
                loadOlder();
            }
        }

        element.addEventListener('scroll', onScroll, { passive: true });

        return () => element.removeEventListener('scroll', onScroll);
    }, [scrollRef, loadOlder]);

    // Expanding a cluster is one-way: once its episodes are revealed the
    // "N episodes" affordance is gone, so there's nothing to re-collapse.
    function expandCluster(key: string) {
        setExpanded((previous) => new Set(previous).add(key));
    }

    if (rows.length === 0) {
        return null;
    }

    const groups = groupByDate(rows);

    return (
        <div style={{ overflowAnchor: 'none' }}>
            {/* Spinner shows only when paging older (never the eager first
                batch, which loads while rows is still empty). */}
            {loading && (
                <div className="flex justify-center pt-1 pb-3">
                    <Spinner className="size-5 text-muted-foreground" />
                </div>
            )}

            <div className="space-y-6">
                {groups.map((group) => (
                    <section key={group.date}>
                        <div className="flex justify-center">
                            <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                                {formatLongDate(parseDateString(group.date))}
                            </span>
                        </div>
                        <ul className="mt-3 space-y-3">
                            {group.shows.map((cluster) => {
                                const key = clusterKey(cluster[0]);
                                const isMulti = cluster.length > 1;
                                const isExpanded = expanded.has(key);
                                const visible =
                                    isMulti && !isExpanded
                                        ? cluster.slice(0, 1)
                                        : cluster;

                                return (
                                    <li key={key} className="space-y-3">
                                        <ul className="space-y-3">
                                            {visible.map((episode) => (
                                                <EpisodeRow
                                                    key={episode.id}
                                                    episode={episode}
                                                    today={today}
                                                    onOpenEpisode={() =>
                                                        onOpenEpisode(
                                                            episode.id,
                                                        )
                                                    }
                                                    onOpenShow={() =>
                                                        onOpenShow(episode)
                                                    }
                                                />
                                            ))}
                                        </ul>
                                        {isMulti && !isExpanded && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    expandCluster(key)
                                                }
                                                className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-left text-sm font-semibold text-sky-400 transition-colors hover:brightness-110"
                                            >
                                                <span>
                                                    {cluster.length} episodes
                                                </span>
                                                <ChevronDown className="size-5" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>

            <div className="h-6" />
        </div>
    );
}
