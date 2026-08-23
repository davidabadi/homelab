import { Film, Tv } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { FullScreenMediaLibrary } from '@/components/full-screen-media-library';
import { ProfileMediaPoster } from '@/components/profile-media-poster';
import { movies, shows } from '@/routes/profile/library';
import type {
    MovieLibraryKey,
    MovieLibraryPayload,
    ProfileMedia,
    ShowLibraryKey,
    ShowLibraryPayload,
} from '@/types';

const showSectionMeta: Record<
    ShowLibraryKey,
    { label: string; progressClassName: string }
> = {
    watching: {
        label: 'Watching',
        progressClassName: 'bg-yellow-400',
    },
    watch_later: {
        label: 'Watch Later',
        progressClassName: 'bg-orange-400',
    },
    up_to_date: {
        label: 'Up to Date',
        progressClassName: 'bg-emerald-400',
    },
    finished: {
        label: 'Finished',
        progressClassName: 'bg-purple-400',
    },
    stopped: {
        label: 'Stopped',
        progressClassName: 'bg-red-400',
    },
};

const movieSectionLabels: Record<MovieLibraryKey, string> = {
    watched: 'Watched',
    not_watched: 'Not Watched',
};

export function ShowLibraryOverlay({
    open,
    refreshKey,
    suspended,
    onClose,
    onOpenShow,
}: {
    open: boolean;
    refreshKey: number;
    suspended: boolean;
    onClose: () => void;
    onOpenShow: (show: ProfileMedia) => void;
}) {
    return (
        <FullScreenMediaLibrary<ShowLibraryPayload>
            open={open}
            title="Shows"
            endpoint={shows.url()}
            refreshKey={refreshKey}
            suspended={suspended}
            onClose={onClose}
        >
            {(payload) =>
                payload.groups.length === 0 ? (
                    <div className="flex min-h-full p-4 sm:p-6">
                        <EmptyState
                            icon={Tv}
                            title="No shows tracked yet"
                            description="Track a show from Search and it will appear here."
                        />
                    </div>
                ) : (
                    <div className="space-y-8 p-4 sm:p-6">
                        {payload.groups.map((group) => {
                            const meta = showSectionMeta[group.key];
                            const headingId = `show-library-${group.key}`;

                            return (
                                <section
                                    key={group.key}
                                    aria-labelledby={headingId}
                                >
                                    <div className="mb-3 flex justify-center">
                                        <h2
                                            id={headingId}
                                            className="rounded-full bg-muted px-3.5 py-1 text-xs font-semibold tracking-wider uppercase"
                                        >
                                            {meta.label}
                                        </h2>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                                        {group.shows.map((show) => (
                                            <ProfileMediaPoster
                                                key={show.id}
                                                media={show}
                                                kind="show"
                                                onOpen={() => onOpenShow(show)}
                                                progress={show.progress}
                                                progressClassName={
                                                    meta.progressClassName
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )
            }
        </FullScreenMediaLibrary>
    );
}

export function MovieLibraryOverlay({
    open,
    refreshKey,
    suspended,
    onClose,
    onOpenMovie,
}: {
    open: boolean;
    refreshKey: number;
    suspended: boolean;
    onClose: () => void;
    onOpenMovie: (movie: ProfileMedia) => void;
}) {
    return (
        <FullScreenMediaLibrary<MovieLibraryPayload>
            open={open}
            title="Movies"
            endpoint={movies.url()}
            refreshKey={refreshKey}
            suspended={suspended}
            onClose={onClose}
        >
            {(payload) =>
                payload.groups.length === 0 ? (
                    <div className="flex min-h-full p-4 sm:p-6">
                        <EmptyState
                            icon={Film}
                            title="No movies tracked yet"
                            description="Track a movie from Search and it will appear here."
                        />
                    </div>
                ) : (
                    <div className="space-y-8 p-4 sm:p-6">
                        {payload.groups.map((group) => {
                            const headingId = `movie-library-${group.key}`;

                            return (
                                <section
                                    key={group.key}
                                    aria-labelledby={headingId}
                                >
                                    <div className="mb-3 flex justify-center">
                                        <h2
                                            id={headingId}
                                            className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                                        >
                                            {movieSectionLabels[group.key]}
                                        </h2>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                                        {group.movies.map((movie) => (
                                            <ProfileMediaPoster
                                                key={movie.id}
                                                media={movie}
                                                kind="movie"
                                                onOpen={() =>
                                                    onOpenMovie(movie)
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )
            }
        </FullScreenMediaLibrary>
    );
}
