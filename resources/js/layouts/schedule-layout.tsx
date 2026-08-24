import type { PropsWithChildren } from 'react';

export default function ScheduleLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-svh bg-[#070b12] text-slate-100">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,.08),transparent_34%),linear-gradient(rgba(255,255,255,.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.012)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px]"
            />
            <main className="relative mx-auto w-full max-w-[118rem] px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
