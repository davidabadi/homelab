import { Play } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type AppLogoIconProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
    alt?: string;
};

export default function AppLogoIcon({
    alt = 'TV Time',
    className,
    ...props
}: AppLogoIconProps) {
    const isDecorative = alt === '';

    return (
        <span
            {...props}
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-500/15',
                className,
            )}
            role={isDecorative ? undefined : 'img'}
            aria-label={isDecorative ? undefined : alt}
            aria-hidden={isDecorative || undefined}
        >
            <Play
                aria-hidden="true"
                className="size-1/2 fill-emerald-400 text-emerald-400"
            />
        </span>
    );
}
