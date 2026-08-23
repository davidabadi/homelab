import { Link, router } from '@inertiajs/react';
import {
    Ellipsis,
    FileClock,
    LogOut,
    Palette,
    ShieldCheck,
    UserRoundCog,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/routes';
import { edit as appearanceSettings } from '@/routes/appearance';
import { edit as accountSettings } from '@/routes/profile';
import { edit as securitySettings } from '@/routes/security';
import { index as importHistory } from '@/routes/yamtrack-import';

const profileDestinations = [
    {
        label: 'Account',
        href: accountSettings(),
        icon: UserRoundCog,
    },
    { label: 'Security', href: securitySettings(), icon: ShieldCheck },
    {
        label: 'Appearance',
        href: appearanceSettings(),
        icon: Palette,
    },
    {
        label: 'Import history',
        href: importHistory(),
        icon: FileClock,
    },
];

export function ProfileMenu() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Open profile menu"
                    className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Ellipsis className="size-5" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="w-56"
            >
                <DropdownMenuGroup>
                    {profileDestinations.map((destination) => (
                        <DropdownMenuItem key={destination.label} asChild>
                            <Link href={destination.href} prefetch>
                                <destination.icon />
                                {destination.label}
                            </Link>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link
                        href={logout()}
                        as="button"
                        className="w-full"
                        onClick={() => router.flushAll()}
                        data-test="profile-menu-logout"
                    >
                        <LogOut />
                        Log out
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
