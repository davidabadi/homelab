import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    FileClock,
    Palette,
    ShieldCheck,
    UserRoundCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { PageScrollArea } from '@/components/page-scroll-area';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';
import { profile } from '@/routes';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import { index as importHistory } from '@/routes/yamtrack-import';

type SettingsNavItem = {
    title: string;
    href: ReturnType<typeof edit>;
    icon: LucideIcon;
};

const settingsNavItems: SettingsNavItem[] = [
    {
        title: 'Account',
        href: edit(),
        icon: UserRoundCog,
    },
    {
        title: 'Security',
        href: editSecurity(),
        icon: ShieldCheck,
    },
    {
        title: 'Appearance',
        href: editAppearance(),
        icon: Palette,
    },
    {
        title: 'Import history',
        href: importHistory(),
        icon: FileClock,
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <PageScrollArea>
            <div className="mx-auto w-full max-w-4xl pb-8">
                <header className="mb-5 flex items-start gap-3">
                    <Link
                        href={profile()}
                        prefetch
                        aria-label="Back to profile"
                        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <ArrowLeft className="size-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            Settings
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your account, security, and appearance
                        </p>
                    </div>
                </header>

                <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
                    <nav
                        className="grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-card/70 p-1 md:h-fit md:grid-cols-1 md:gap-1"
                        aria-label="Settings categories"
                    >
                        {settingsNavItems.map((item) => {
                            const active = isCurrentUrl(item.href);

                            return (
                                <Link
                                    key={item.title}
                                    href={item.href}
                                    prefetch
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:gap-2.5 md:px-3 md:text-sm',
                                        active
                                            ? 'bg-accent text-accent-foreground'
                                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            'size-4.5 shrink-0',
                                            active && 'text-emerald-400',
                                        )}
                                    />
                                    <span className="truncate">
                                        {item.title}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    <section aria-label="Settings content" className="min-w-0">
                        {children}
                    </section>
                </div>
            </div>
        </PageScrollArea>
    );
}
