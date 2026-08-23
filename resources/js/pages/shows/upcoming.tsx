import { Head, router } from '@inertiajs/react';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { EpisodeQuickViewModal } from '@/components/episode-quick-view-modal';
import Heading from '@/components/heading';
import { MediaSubTabs } from '@/components/media-sub-tabs';
import { PageScrollArea } from '@/components/page-scroll-area';
import { ShowDetailModal } from '@/components/show-detail-modal';
import { UpcomingBacklog } from '@/components/upcoming-backlog';
import { EpisodeRow } from '@/components/upcoming-episode-row';
import type { UpcomingEpisode } from '@/components/upcoming-episode-row';
import {
    daysBetween,
    formatLongDate,
    formatWeekday,
    parseDateString,
} from '@/lib/dates';
import { shows } from '@/routes';
import { upcoming } from '@/routes/shows';

/**
 * Section header for one future air date: "Today" / "Tomorrow", the weekday name
 * inside the next week, then full calendar dates further out (spec §5).
 */
function sectionLabel(airDate: string, today: string): string {
    const date = parseDateString(airDate);
    const days = daysBetween(parseDateString(today), date);

    if (days === 0) {
        return 'Today';
    }

    if (days === 1) {
        return 'Tomorrow';
    }

    if (days < 7) {
        return formatWeekday(date);
    }

    return formatLongDate(date);
}

type FutureSection = {
    key: string;
    label: string;
    clusters: UpcomingEpisode[][];
};

function groupFutureEpisodes(
    episodes: UpcomingEpisode[],
    today: string,
): FutureSection[] {
    const sections: FutureSection[] = [];

    for (const episode of episodes) {
        const days = daysBetween(
            parseDateString(today),
            parseDateString(episode.air_date),
        );
        const key = days >= 7 ? 'later' : episode.air_date;
        let section = sections.find((candidate) => candidate.key === key);

        if (!section) {
            section = {
                key,
                label: key === 'later' ? 'Later' : sectionLabel(key, today),
                clusters: [],
            };
            sections.push(section);
        }

        const cluster = section.clusters.find(
            (candidate) =>
                candidate[0].show_id === episode.show_id &&
                candidate[0].air_date === episode.air_date,
        );

        if (cluster) {
            cluster.push(episode);
        } else {
            section.clusters.push([episode]);
        }
    }

    return sections;
}

function clusterKey(episode: UpcomingEpisode): string {
    return `${episode.show_id}|${episode.air_date}`;
}

export default function ShowsUpcoming({
    episodes,
    today,
}: {
    episodes: UpcomingEpisode[];
    today: string;
}) {
    const [episodeModalId, setEpisodeModalId] = useState<number | null>(null);
    const [showModal, setShowModal] = useState<{
        showId: number;
        title: string;
    } | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const scrollRef = useRef<HTMLDivElement | null>(null);

    const sections = groupFutureEpisodes(episodes, today);

    function openShow(episode: UpcomingEpisode) {
        setShowModal({
            showId: episode.show_id,
            title: episode.show_title ?? 'Show',
        });
    }

    function handleModalClose(dirty: boolean) {
        setEpisodeModalId(null);
        setShowModal(null);

        if (dirty) {
            router.reload({ only: ['episodes'] });
        }
    }

    return (
        <>
            <Head title="Shows" />
            <div className="hidden md:block">
                <Heading
                    title="Shows"
                    description="What you're watching and what's next."
                />
            </div>
            <MediaSubTabs
                tabs={[
                    { title: 'Watch List', href: shows() },
                    { title: 'Upcoming', href: upcoming() },
                ]}
            />
            <PageScrollArea
                scrollRef={scrollRef}
                className="[overflow-anchor:none]"
            >
                {/* Aired-but-unwatched backlog, parked off-screen above the
                    future feed and revealed by scrolling up. */}
                <UpcomingBacklog
                    scrollRef={scrollRef}
                    today={today}
                    onOpenEpisode={setEpisodeModalId}
                    onOpenShow={openShow}
                />

                {/* The future feed fills at least the viewport, so the backlog
                    above always parks off-screen on initial load. */}
                <div className="min-h-full">
                    {episodes.length === 0 ? (
                        <EmptyState
                            icon={CalendarClock}
                            title="Nothing on the calendar"
                            description="Upcoming episodes from shows you track will appear here as air dates are announced."
                        />
                    ) : (
                        <div className="space-y-6">
                            {sections.map((section) => (
                                <section key={section.key}>
                                    <div className="flex justify-center">
                                        <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                                            {section.label}
                                        </span>
                                    </div>
                                    <ul className="mt-3 space-y-3">
                                        {section.clusters.map((cluster) => {
                                            const key = clusterKey(cluster[0]);
                                            const collapsed =
                                                cluster.length > 1 &&
                                                !expanded.has(key);
                                            const visible = collapsed
                                                ? cluster.slice(0, 1)
                                                : cluster;

                                            return (
                                                <li
                                                    key={key}
                                                    className="space-y-3"
                                                >
                                                    <ul className="space-y-3">
                                                        {visible.map(
                                                            (episode) => (
                                                                <EpisodeRow
                                                                    key={
                                                                        episode.id
                                                                    }
                                                                    episode={
                                                                        episode
                                                                    }
                                                                    today={
                                                                        today
                                                                    }
                                                                    onOpenEpisode={() =>
                                                                        setEpisodeModalId(
                                                                            episode.id,
                                                                        )
                                                                    }
                                                                    onOpenShow={() =>
                                                                        openShow(
                                                                            episode,
                                                                        )
                                                                    }
                                                                />
                                                            ),
                                                        )}
                                                    </ul>
                                                    {collapsed && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpanded(
                                                                    (
                                                                        previous,
                                                                    ) =>
                                                                        new Set(
                                                                            previous,
                                                                        ).add(
                                                                            key,
                                                                        ),
                                                                )
                                                            }
                                                            className="flex w-full items-center justify-between rounded-xl bg-surface px-4 py-3 text-left text-sm font-semibold text-sky-400 transition-colors hover:brightness-110"
                                                        >
                                                            <span>
                                                                {cluster.length}{' '}
                                                                episodes
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
                    )}
                </div>
            </PageScrollArea>

            {episodeModalId !== null && (
                <EpisodeQuickViewModal
                    episodeId={episodeModalId}
                    onClose={handleModalClose}
                />
            )}
            {showModal !== null && (
                <ShowDetailModal
                    showId={showModal.showId}
                    title={showModal.title}
                    onClose={handleModalClose}
                />
            )}
        </>
    );
}
