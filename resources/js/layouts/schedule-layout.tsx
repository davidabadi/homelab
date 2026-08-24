import type { PropsWithChildren } from 'react';

export default function ScheduleLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-svh bg-background text-foreground">
            <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
                {children}
            </main>
        </div>
    );
}
