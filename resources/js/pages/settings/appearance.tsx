import { Head } from '@inertiajs/react';
import AppearanceTabs from '@/components/appearance-tabs';
import Heading from '@/components/heading';

export default function Appearance() {
    return (
        <>
            <Head title="Appearance settings" />

            <h1 className="sr-only">Appearance settings</h1>

            <section className="space-y-6 rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-6">
                <Heading
                    variant="small"
                    title="Color theme"
                    description="Choose light, dark, or follow your system setting"
                />
                <AppearanceTabs />
            </section>
        </>
    );
}
