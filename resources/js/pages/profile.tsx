import { Head, router } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { HorizontalMediaShelf } from '@/components/horizontal-media-shelf';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { PageScrollArea } from '@/components/page-scroll-area';
import {
    MovieLibraryOverlay,
    ShowLibraryOverlay,
} from '@/components/profile-libraries';
import { ProfileMenu } from '@/components/profile-menu';
import {
    formatProfileDuration,
    ProfileStatCard,
} from '@/components/profile-stat-card';
import { ShowDetailModal } from '@/components/show-detail-modal';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import type { ProfileMedia, ProfileStats, ProfileUser } from '@/types';

function ProfileSectionHeader({
    title,
    onOpen,
}: {
    title: string;
    onOpen: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`Open all ${title.toLocaleLowerCase()}`}
            className="group flex w-full items-center justify-between rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </button>
    );
}

export default function Profile({
    user,
    stats,
    recentShows,
    recentMovies,
}: {
    user: ProfileUser;
    stats: ProfileStats;
    recentShows: ProfileMedia[];
    recentMovies: ProfileMedia[];
}) {
    const getInitials = useInitials();
    const [library, setLibrary] = useState<'shows' | 'movies' | null>(null);
    const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
    const [showModal, setShowModal] = useState<ProfileMedia | null>(null);
    const [movieModal, setMovieModal] = useState<ProfileMedia | null>(null);

    const detailOpen = showModal !== null || movieModal !== null;

    function handleDetailClose(dirty: boolean) {
        setShowModal(null);
        setMovieModal(null);

        if (dirty) {
            router.reload({
                only: ['stats', 'recentShows', 'recentMovies'],
            });
            setLibraryRefreshKey((value) => value + 1);
        }
    }

    return (
        <>
            <Head title="Profile" />

            <header className="mb-6 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4">
                <Avatar className="size-11">
                    <AvatarFallback className="bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300">
                        {getInitials(user.name)}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-lg font-semibold tracking-tight">
                        {user.name}
                    </h1>
                    <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </p>
                </div>
                <ProfileMenu />
            </header>

            <PageScrollArea>
                <div className="space-y-8">
                    <section aria-labelledby="profile-stats-heading">
                        <h2
                            id="profile-stats-heading"
                            className="mb-3 text-lg font-semibold tracking-tight"
                        >
                            Stats
                        </h2>
                        <div className="-mx-4 [scrollbar-width:thin] overflow-x-auto px-4 pb-2 md:-mx-2 md:px-2">
                            <div className="flex w-max snap-x snap-proximity gap-3">
                                <div className="snap-start">
                                    <ProfileStatCard
                                        label="TV time"
                                        value={formatProfileDuration(
                                            stats.tv_minutes,
                                        )}
                                    />
                                </div>
                                <div className="snap-start">
                                    <ProfileStatCard
                                        label="Episodes watched"
                                        value={stats.episodes_watched.toLocaleString()}
                                    />
                                </div>
                                <div className="snap-start">
                                    <ProfileStatCard
                                        label="Movie time"
                                        value={formatProfileDuration(
                                            stats.movie_minutes,
                                        )}
                                    />
                                </div>
                                <div className="snap-start">
                                    <ProfileStatCard
                                        label="Movies watched"
                                        value={stats.movies_watched.toLocaleString()}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section aria-labelledby="recent-shows-heading">
                        <div id="recent-shows-heading" className="mb-3">
                            <ProfileSectionHeader
                                title="Shows"
                                onOpen={() => setLibrary('shows')}
                            />
                        </div>
                        <HorizontalMediaShelf
                            media={recentShows}
                            kind="show"
                            onOpen={setShowModal}
                        />
                    </section>

                    <section aria-labelledby="recent-movies-heading">
                        <div id="recent-movies-heading" className="mb-3">
                            <ProfileSectionHeader
                                title="Movies"
                                onOpen={() => setLibrary('movies')}
                            />
                        </div>
                        <HorizontalMediaShelf
                            media={recentMovies}
                            kind="movie"
                            onOpen={setMovieModal}
                        />
                    </section>
                </div>
            </PageScrollArea>

            <ShowLibraryOverlay
                open={library === 'shows'}
                refreshKey={libraryRefreshKey}
                suspended={detailOpen}
                onClose={() => setLibrary(null)}
                onOpenShow={setShowModal}
            />
            <MovieLibraryOverlay
                open={library === 'movies'}
                refreshKey={libraryRefreshKey}
                suspended={detailOpen}
                onClose={() => setLibrary(null)}
                onOpenMovie={setMovieModal}
            />

            {showModal !== null && (
                <ShowDetailModal
                    showId={showModal.id}
                    title={showModal.title}
                    onClose={handleDetailClose}
                />
            )}
            {movieModal !== null && (
                <MovieDetailModal
                    movieId={movieModal.id}
                    title={movieModal.title}
                    onClose={handleDetailClose}
                />
            )}
        </>
    );
}
