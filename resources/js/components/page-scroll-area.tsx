import { cn } from '@/lib/utils';

/**
 * The scrollable body of a tracker screen. The layout's <main> is a fixed
 * viewport-height column, so headings, search bars, and sub-tabs stay pinned
 * while only this region scrolls. Its mobile bottom margin shortens the actual
 * scroll viewport so content can never render underneath the fixed tab bar.
 */
export function PageScrollArea({
    children,
    className,
    scrollRef,
}: {
    children: React.ReactNode;
    className?: string;
    scrollRef?: React.Ref<HTMLDivElement>;
}) {
    return (
        <div
            ref={scrollRef}
            className={cn(
                'mb-[calc(4rem+env(safe-area-inset-bottom))] flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 md:mb-0 md:pb-16',
                className,
            )}
        >
            {children}
        </div>
    );
}
