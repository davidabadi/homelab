export type ProfileUser = {
    name: string;
    email: string;
};

export type ProfileStats = {
    tv_minutes: number;
    episodes_watched: number;
    movie_minutes: number;
    movies_watched: number;
};

export type ProfileMedia = {
    id: number;
    title: string;
    poster_url: string | null;
};

export type ShowLibraryKey =
    'watching' | 'watch_later' | 'up_to_date' | 'finished' | 'stopped';

export type ShowLibraryItem = ProfileMedia & {
    progress: {
        watched: number;
        aired: number;
        percentage: number;
        visible: boolean;
    };
};

export type ShowLibraryPayload = {
    groups: Array<{
        key: ShowLibraryKey;
        shows: ShowLibraryItem[];
    }>;
};

export type MovieLibraryKey = 'watched' | 'not_watched';

export type MovieLibraryPayload = {
    groups: Array<{
        key: MovieLibraryKey;
        movies: ProfileMedia[];
    }>;
};
