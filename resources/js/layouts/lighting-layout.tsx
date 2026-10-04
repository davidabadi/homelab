import type { PropsWithChildren } from 'react';

export default function LightingLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-svh bg-background text-foreground">
            <main className="w-full">{children}</main>
        </div>
    );
}
