import { Head, router } from '@inertiajs/react';
import { CalendarClock, Film } from 'lucide-react';
import { useState } from 'react';
import { Countdown } from '@/components/countdown';
import { EmptyState } from '@/components/empty-state';
import Heading from '@/components/heading';
import { MediaRow } from '@/components/media-row';
import { MediaSubTabs } from '@/components/media-sub-tabs';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { PageScrollArea } from '@/components/page-scroll-area';
import { formatLongDate, parseDateString } from '@/lib/dates';
import { movies } from '@/routes';
import { upcoming } from '@/routes/movies';

type UpcomingMovie = {
    id: number;
    title: string;
    poster_url: string | null;
    release_date: string;
    days_until: number;
};

/**
 * Countdown buckets for the section pills (spec §5: grouped, e.g. "Later").
 */
function bucketLabel(daysUntil: number): string {
    if (daysUntil < 7) {
        return 'This Week';
    }

    if (daysUntil < 30) {
        return 'This Month';
    }

    return 'Later';
}

function MovieRow({
    movie,
    onOpen,
}: {
    movie: UpcomingMovie;
    onOpen: () => void;
}) {
    return (
        <MediaRow
            posterUrl={movie.poster_url}
            fallbackIcon={Film}
            primary={movie.title}
            secondary={formatLongDate(parseDateString(movie.release_date))}
            onClick={onOpen}
            trailing={<Countdown daysUntil={movie.days_until} />}
        />
    );
}

export default function MoviesUpcoming({
    movies: upcomingMovies,
}: {
    movies: UpcomingMovie[];
    today: string;
}) {
    const [movieModal, setMovieModal] = useState<{
        movieId: number;
        title: string;
    } | null>(null);

    // Movies arrive sorted by release date; fold them into countdown buckets.
    // Insertion order keeps buckets chronological: This Week → This Month → Later.
    const sections = new Map<string, UpcomingMovie[]>();

    for (const movie of upcomingMovies) {
        const label = bucketLabel(movie.days_until);
        const group = sections.get(label) ?? [];
        group.push(movie);
        sections.set(label, group);
    }

    function handleModalClose(dirty: boolean) {
        setMovieModal(null);

        if (dirty) {
            router.reload({ only: ['movies'] });
        }
    }

    return (
        <>
            <Head title="Movies" />
            <div className="hidden md:block">
                <Heading
                    title="Movies"
                    description="Your movie watch list and upcoming releases."
                />
            </div>
            <MediaSubTabs
                tabs={[
                    { title: 'Watch List', href: movies() },
                    { title: 'Upcoming', href: upcoming() },
                ]}
            />
            <PageScrollArea>
                {upcomingMovies.length === 0 ? (
                    <EmptyState
                        icon={CalendarClock}
                        title="No upcoming releases"
                        description="Movies you track with a future release date will appear here, counting down to release day."
                    />
                ) : (
                    <div className="space-y-6">
                        {[...sections.entries()].map(([label, group]) => (
                            <section key={label}>
                                <div className="flex justify-center">
                                    <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                                        {label}
                                    </span>
                                </div>
                                <ul className="mt-3 space-y-3">
                                    {group.map((movie) => (
                                        <MovieRow
                                            key={movie.id}
                                            movie={movie}
                                            onOpen={() =>
                                                setMovieModal({
                                                    movieId: movie.id,
                                                    title: movie.title,
                                                })
                                            }
                                        />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </PageScrollArea>

            {movieModal !== null && (
                <MovieDetailModal
                    movieId={movieModal.movieId}
                    title={movieModal.title}
                    onClose={handleModalClose}
                />
            )}
        </>
    );
}
