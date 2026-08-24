import { CalendarDays, MapPin } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { cn } from '@/lib/utils';

type ModuleLogoIconProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

export default function ModuleLogoIcon({
    className,
    ...props
}: ModuleLogoIconProps) {
    const module = document.documentElement.dataset.appModule;
    const appName = document.documentElement.dataset.appName;

    if (module === 'tv' || module === 'shared') {
        return <AppLogoIcon className={className} {...props} />;
    }

    const Icon = module === 'presence' ? MapPin : CalendarDays;
    const moduleClasses =
        module === 'presence'
            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';

    return (
        <span
            {...props}
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-lg',
                moduleClasses,
                className,
            )}
            role="img"
            aria-label={appName}
        >
            <Icon aria-hidden="true" className="size-1/2" />
        </span>
    );
}
