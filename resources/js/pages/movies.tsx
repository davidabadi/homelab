import { Head, router } from '@inertiajs/react';
import { Film } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import Heading from '@/components/heading';
import { MediaSubTabs } from '@/components/media-sub-tabs';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { MoviePosterGrid } from '@/components/movie-poster-grid';
import type { MovieCard } from '@/components/movie-poster-grid';
import { PageScrollArea } from '@/components/page-scroll-area';
import { movies } from '@/routes';
import { upcoming } from '@/routes/movies';

/**
 * Movies › Watch List (spec §5, 04-movies-watchlist-grid.png): a "Watch Next"
 * poster grid of movies this user tracks but hasn't watched, and a link to
 * "Browse All Movies" for the full grouped grid. Tapping a poster opens the
 * movie detail modal where the multi-watch toggle lives.
 */
export default function Movies({
    watchNext,
    trackedCount,
}: {
    watchNext: MovieCard[];
    trackedCount: number;
}) {
    const [movieModal, setMovieModal] = useState<{
        movieId: number;
        title: string;
    } | null>(null);

    function handleModalClose(dirty: boolean) {
        setMovieModal(null);

        if (dirty) {
            router.reload();
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
                {trackedCount === 0 ? (
                    <EmptyState
                        icon={Film}
                        title="No movies tracked yet"
                        description="Track a movie from Search and it'll show up here, ready to watch."
                    />
                ) : (
                    <>
                        <div className="flex justify-center">
                            <span className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase">
                                Watch Next
                            </span>
                        </div>
                        {watchNext.length === 0 ? (
                            <p className="mt-6 text-center text-sm text-muted-foreground">
                                There are no released, unwatched movies on your
                                watch list.
                            </p>
                        ) : (
                            <div className="mt-4">
                                <MoviePosterGrid
                                    movies={watchNext}
                                    onOpen={(movie) =>
                                        setMovieModal({
                                            movieId: movie.id,
                                            title: movie.title ?? 'Movie',
                                        })
                                    }
                                />
                            </div>
                        )}
                    </>
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
