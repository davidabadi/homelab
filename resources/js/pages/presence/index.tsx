import { Head } from '@inertiajs/react';

export default function PresenceIndex() {
    return (
        <>
            <Head title="US Presence" />
            <section className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                    US Presence
                </h1>
                <p className="text-sm text-muted-foreground">
                    This module is ready for future implementation.
                </p>
            </section>
        </>
    );
}
