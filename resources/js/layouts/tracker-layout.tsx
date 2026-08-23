import { Link, usePage } from '@inertiajs/react';
import { ChevronsUpDown, Film, Search, Tv, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AppLogoIcon from '@/components/app-logo-icon';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useTimezoneSync } from '@/hooks/use-timezone-sync';
import { cn } from '@/lib/utils';
import { movies, profile, search, shows } from '@/routes';
import type { Auth } from '@/types';

type TrackerNavItem = {
    title: string;
    href: ReturnType<typeof shows>;
    icon: LucideIcon;
    additionalActivePaths?: string[];
};

const navItems: TrackerNavItem[] = [
    { title: 'Shows', href: shows(), icon: Tv },
    { title: 'Movies', href: movies(), icon: Film },
    { title: 'Search', href: search(), icon: Search },
    {
        title: 'Profile',
        href: profile(),
        icon: UserRound,
        additionalActivePaths: ['/settings'],
    },
];

function useIsTrackerNavItemActive() {
    const { currentUrl, isCurrentOrParentUrl } = useCurrentUrl();

    return (item: TrackerNavItem): boolean =>
        isCurrentOrParentUrl(item.href) ||
        (item.additionalActivePaths ?? []).some(
            (path) => currentUrl === path || currentUrl.startsWith(`${path}/`),
        );
}

function TrackerWordmark() {
    return (
        <Link
            href={shows()}
            prefetch
            className="flex items-center gap-2.5 px-5 py-5"
        >
            <AppLogoIcon alt="" className="size-8" />
            <span className="text-base font-semibold tracking-tight">
                TV Time
            </span>
        </Link>
    );
}

/**
 * Desktop navigation: fixed left sidebar with the same four destinations as
 * the mobile tab bar, plus the user menu. Deliberately simple — the desktop
 * layout is being iterated on as the app grows.
 */
function DesktopSidebar({ user }: { user: Auth['user'] }) {
    const isActive = useIsTrackerNavItemActive();

    return (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-sidebar md:flex">
            <TrackerWordmark />
            <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
                {navItems.map((item) => {
                    const active = isActive(item);

                    return (
                        <Link
                            key={item.title}
                            href={item.href}
                            prefetch
                            className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                active
                                    ? 'bg-accent text-accent-foreground'
                                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                            )}
                        >
                            <item.icon
                                className={cn(
                                    'size-4.5',
                                    active && 'text-emerald-400',
                                )}
                            />
                            {item.title}
                        </Link>
                    );
                })}
            </nav>
            <div className="border-t border-border/60 p-3">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                            <UserInfo user={user} />
                            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-56 rounded-lg"
                        align="start"
                        side="top"
                    >
                        <UserMenuContent user={user} />
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </aside>
    );
}

/**
 * Mobile navigation: fixed bottom tab bar (spec §5 / §8), safe-area aware for
 * standalone PWA installs.
 */
function BottomTabBar() {
    const isActive = useIsTrackerNavItemActive();

    return (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/85 backdrop-blur-lg md:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4 gap-1 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)]">
                {navItems.map((item) => {
                    const active = isActive(item);

                    return (
                        <Link
                            key={item.title}
                            href={item.href}
                            prefetch
                            className={cn(
                                'flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors',
                                active
                                    ? 'text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <item.icon
                                className={cn(
                                    'size-5',
                                    active && 'text-emerald-400',
                                )}
                                strokeWidth={active ? 2.25 : 1.75}
                            />
                            <span>{item.title}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

export default function TrackerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { auth } = usePage<{ auth: Auth }>().props;

    useTimezoneSync();

    return (
        <div className="min-h-svh bg-background text-foreground">
            <DesktopSidebar user={auth.user} />
            <div className="md:pl-60">
                {/* Fixed-height column: headers/tabs render as static children,
                    and each page scrolls its own list inside PageScrollArea
                    (which also carries the mobile tab-bar clearance). */}
                <main className="mx-auto flex h-svh w-full max-w-5xl flex-col overflow-hidden px-4 pt-6 md:px-8 md:pt-8">
                    {children}
                </main>
            </div>
            <BottomTabBar />
        </div>
    );
}
