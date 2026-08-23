import { Film, Tv } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ProfileMediaPoster } from '@/components/profile-media-poster';
import type { ProfileMedia } from '@/types';

export function HorizontalMediaShelf({
    media,
    kind,
    onOpen,
}: {
    media: ProfileMedia[];
    kind: 'show' | 'movie';
    onOpen: (media: ProfileMedia) => void;
}) {
    if (media.length === 0) {
        return (
            <EmptyState
                icon={kind === 'show' ? Tv : Film}
                title={`No ${kind === 'show' ? 'shows' : 'movies'} tracked yet`}
                description={`Track a ${kind} from Search and it will appear here.`}
                className="py-10"
            />
        );
    }

    return (
        <div className="-mx-4 [scrollbar-width:thin] overflow-x-auto px-4 pb-2 md:-mx-2 md:px-2">
            <div className="flex w-max snap-x snap-proximity gap-3">
                {media.map((item) => (
                    <ProfileMediaPoster
                        key={item.id}
                        media={item}
                        kind={kind}
                        onOpen={() => onOpen(item)}
                        className="w-28 shrink-0 snap-start sm:w-32 md:w-36"
                    />
                ))}
            </div>
        </div>
    );
}
