import type { LucideIcon } from 'lucide-react';

/**
 * Empty-state placeholder for nav shell pages whose real content is a later
 * build order item.
 */
export function ComingSoon({
    icon: Icon,
    title,
    description,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/70 px-6 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
                <Icon className="size-7 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
                <h2 className="text-lg font-medium">{title}</h2>
                <p className="mx-auto max-w-sm text-sm text-balance text-muted-foreground">
                    {description}
                </p>
            </div>
        </div>
    );
}
