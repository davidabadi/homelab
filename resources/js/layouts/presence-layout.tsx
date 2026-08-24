import type { PropsWithChildren } from 'react';

export default function PresenceLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-svh bg-stone-100 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
            <main className="mx-auto w-full max-w-6xl px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
                {children}
            </main>
        </div>
    );
}
