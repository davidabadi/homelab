import type { InertiaLinkProps } from '@inertiajs/react';
import { Link } from '@inertiajs/react';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';

type MediaSubTab = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
};

/**
 * The Watch List | Upcoming sub-tab bar shared by the Shows and Movies tabs
 * (spec §5): full-width segments with an underline on the active tab.
 */
export function MediaSubTabs({ tabs }: { tabs: MediaSubTab[] }) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <nav className="mb-6 grid grid-cols-2 border-b border-border/60">
            {tabs.map((tab) => {
                const active = isCurrentUrl(tab.href);

                return (
                    <Link
                        key={tab.title}
                        href={tab.href}
                        prefetch
                        className={cn(
                            '-mb-px border-b-2 pt-1 pb-2.5 text-center text-sm font-semibold tracking-widest uppercase transition-colors',
                            active
                                ? 'border-foreground text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {tab.title}
                    </Link>
                );
            })}
        </nav>
    );
}
