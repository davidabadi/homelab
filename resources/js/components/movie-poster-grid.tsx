import { Check, Film } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MovieCard = {
    id: number;
    title: string | null;
    poster_url: string | null;
    release_date: string | null;
    watch_count: number;
};

/**
 * The movie poster grid behind the Movies Watch List "Watch Next" and "Browse
 * All" screens (spec §5, 04-movies-watchlist-grid.png). Watched posters carry a
 * small badge — a check, or "×N" once rewatched. Tapping a poster opens the
 * movie detail modal, where the multi-watch toggle lives.
 */
export function MoviePosterGrid({
    movies,
    onOpen,
}: {
    movies: MovieCard[];
    onOpen: (movie: MovieCard) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {movies.map((movie) => (
                <button
                    key={movie.id}
                    type="button"
                    onClick={() => onOpen(movie)}
                    className="group relative aspect-2/3 overflow-hidden rounded-lg bg-muted text-left"
                >
                    {movie.poster_url ? (
                        <img
                            src={movie.poster_url}
                            alt={movie.title ?? ''}
                            className="size-full object-cover transition-opacity group-hover:opacity-80"
                        />
                    ) : (
                        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center">
                            <Film className="size-6 text-muted-foreground" />
                            <span className="line-clamp-3 text-xs text-muted-foreground">
                                {movie.title}
                            </span>
                        </div>
                    )}
                    {movie.watch_count > 0 && (
                        <span
                            className={cn(
                                'absolute top-1.5 right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white shadow',
                            )}
                        >
                            {movie.watch_count > 1 ? (
                                <span className="tabular-nums">
                                    ×{movie.watch_count}
                                </span>
                            ) : (
                                <Check className="size-3.5" strokeWidth={3} />
                            )}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}
