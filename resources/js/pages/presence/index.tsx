import { Head, router } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    CircleAlert,
    FileSpreadsheet,
    Gauge,
    MapPin,
    Pencil,
    Plus,
    Settings2,
} from 'lucide-react';
import { useState } from 'react';
import {
    updateDefault,
    updateYear,
} from '@/actions/App/Http/Controllers/PresencePlanningController';
import {
    destroy,
    store,
    update,
} from '@/actions/App/Http/Controllers/PresenceTripController';
import {
    presenceErrorMessage,
    presenceRequest,
} from '@/components/presence/api';
import { CsvTransfer } from '@/components/presence/csv-transfer';
import { PlanningEditor } from '@/components/presence/planning-editor';
import { TripEditor } from '@/components/presence/trip-editor';
import type {
    Planning,
    PresenceSummary,
    PresenceTrip,
    PresenceTripInput,
    WeightedComponent,
} from '@/components/presence/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateOnly } from '@/lib/presence';
import { home } from '@/routes/presence';

type Props = {
    today: string;
    currentYear: number;
    selectedYear: number;
    availableYears: number[];
    summary: PresenceSummary;
    weightedComponents: WeightedComponent[];
    trips: PresenceTrip[];
    currentStatus: {
        inside: boolean;
        day: number | null;
        trip_id: number | null;
    };
    planning: Planning;
};

function MetricCard({
    label,
    value,
    detail,
    tone = 'neutral',
}: {
    label: string;
    value: number | string;
    detail: string;
    tone?: 'actual' | 'planned' | 'projected' | 'neutral';
}) {
    const tones = {
        actual: 'border-emerald-700/20 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10',
        planned:
            'border-amber-700/20 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10',
        projected:
            'border-sky-700/20 bg-sky-50 dark:border-sky-400/20 dark:bg-sky-400/10',
        neutral:
            'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900',
    };

    return (
        <article className={`rounded-2xl border p-4 sm:p-5 ${tones[tone]}`}>
            <p className="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase dark:text-stone-400">
                {label}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {value}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                {detail}
            </p>
        </article>
    );
}

const phaseLabels: Record<PresenceTrip['phase'], string> = {
    actual: 'Actual',
    current: 'Current stay',
    scheduled: 'Confirmed future',
    planned: 'Planned',
};

export default function PresenceIndex(props: Props) {
    const {
        today,
        currentYear,
        selectedYear,
        availableYears,
        summary,
        weightedComponents,
        trips,
        currentStatus,
        planning,
    } = props;
    const [tripEditorOpen, setTripEditorOpen] = useState(false);
    const [editingTrip, setEditingTrip] = useState<PresenceTrip | null>(null);
    const [planningOpen, setPlanningOpen] = useState(false);
    const [csvOpen, setCsvOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const futureConfirmed = Math.max(
        0,
        summary.confirmed_scheduled_days - summary.confirmed_days_elapsed,
    );
    const overTargetWithPlans =
        trips.some((trip) => trip.status === 'planned') &&
        summary.remaining_against_planning_limit !== null &&
        summary.remaining_against_planning_limit < 0;

    function selectYear(year: number): void {
        router.visit(home.url({ query: { year } }), { preserveScroll: true });
    }

    function openNewTrip(): void {
        setEditingTrip(null);
        setError(null);
        setTripEditorOpen(true);
    }

    function openTrip(trip: PresenceTrip): void {
        setEditingTrip(trip);
        setError(null);
        setTripEditorOpen(true);
    }

    async function saveTrip(input: PresenceTripInput): Promise<void> {
        setSaving(true);
        setError(null);

        try {
            await presenceRequest(
                editingTrip ? update.url(editingTrip.id) : store.url(),
                {
                    method: editingTrip ? 'PUT' : 'POST',
                    body: JSON.stringify(input),
                },
            );
            setTripEditorOpen(false);
            router.reload();
        } catch (caught) {
            setError(presenceErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    async function deleteTrip(trip: PresenceTrip): Promise<void> {
        if (!window.confirm('Delete this trip? This cannot be undone.')) {
            return;
        }

        setSaving(true);
        setError(null);

        try {
            await presenceRequest(destroy.url(trip.id), { method: 'DELETE' });
            setTripEditorOpen(false);
            router.reload();
        } catch (caught) {
            setError(presenceErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    async function savePlanning(
        defaultLimit: number | null,
        yearLimit: number | null,
    ): Promise<void> {
        setSaving(true);
        setError(null);

        try {
            await presenceRequest(updateDefault.url(), {
                method: 'PUT',
                body: JSON.stringify({ default_planning_limit: defaultLimit }),
            });
            await presenceRequest(updateYear.url(selectedYear), {
                method: 'PUT',
                body: JSON.stringify({ planning_limit: yearLimit }),
            });
            setPlanningOpen(false);
            router.reload();
        } catch (caught) {
            setError(presenceErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Head title={`${selectedYear} US Presence`} />
            <div className="flex flex-col gap-6 sm:gap-8">
                <header className="relative overflow-hidden rounded-3xl bg-emerald-950 px-5 py-6 text-white shadow-xl shadow-emerald-950/10 sm:px-8 sm:py-8 dark:border dark:border-emerald-300/15">
                    <div className="absolute -top-20 -right-16 size-56 rounded-full border-[36px] border-emerald-400/10" />
                    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex flex-col gap-3">
                            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-emerald-300 uppercase">
                                <MapPin className="size-4" /> US Presence
                            </p>
                            <div>
                                <p className="text-sm text-emerald-100/70">
                                    Calendar year
                                </p>
                                <h1 className="text-6xl font-black tracking-[-0.06em] tabular-nums sm:text-7xl">
                                    {selectedYear}
                                </h1>
                            </div>
                            <p className="flex items-center gap-2 text-sm font-semibold">
                                <span
                                    className={`size-2.5 rounded-full ${currentStatus.inside ? 'animate-pulse bg-emerald-300' : 'bg-stone-400'}`}
                                />
                                {currentStatus.inside
                                    ? `In the U.S. · day ${currentStatus.day} of current stay`
                                    : 'Outside the U.S.'}
                            </p>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                            <Button
                                aria-label="Previous year"
                                className="border-emerald-700 bg-emerald-900 text-white hover:bg-emerald-800"
                                size="icon"
                                variant="outline"
                                onClick={() => selectYear(selectedYear - 1)}
                            >
                                <ArrowLeft />
                            </Button>
                            <label className="sr-only" htmlFor="presence-year">
                                Select year
                            </label>
                            <select
                                id="presence-year"
                                className="h-9 rounded-md border border-emerald-700 bg-emerald-900 px-3 text-sm font-semibold text-white outline-none focus:ring-2 focus:ring-emerald-300"
                                value={selectedYear}
                                onChange={(event) =>
                                    selectYear(Number(event.target.value))
                                }
                            >
                                {availableYears.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                        {year === currentYear
                                            ? ' · current'
                                            : ''}
                                    </option>
                                ))}
                            </select>
                            <Button
                                aria-label="Next year"
                                className="border-emerald-700 bg-emerald-900 text-white hover:bg-emerald-800"
                                size="icon"
                                variant="outline"
                                onClick={() => selectYear(selectedYear + 1)}
                            >
                                <ArrowRight />
                            </Button>
                        </div>
                    </div>
                </header>

                <section className="grid gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold tracking-tight">
                            Year at a glance
                        </h2>
                        <p className="text-xs text-stone-500">
                            As of {formatDateOnly(today)}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                        <MetricCard
                            detail="Confirmed calendar days that have elapsed."
                            label="Actual elapsed"
                            tone="actual"
                            value={summary.confirmed_days_elapsed}
                        />
                        <MetricCard
                            detail={`${futureConfirmed} confirmed future · ${summary.planned_days} planned-status days; shared dates count once`}
                            label="Planned / future"
                            tone="planned"
                            value={Math.max(
                                0,
                                summary.projected_total -
                                    summary.confirmed_days_elapsed,
                            )}
                        />
                        <MetricCard
                            detail="Full-year union of confirmed and planned dates."
                            label="Projected year"
                            tone="projected"
                            value={summary.projected_total}
                        />
                        <MetricCard
                            detail="Legacy 1 + ⅓ + ⅙; each component rounds up."
                            label="3-year weighted"
                            value={summary.legacy_weighted_total}
                        />
                        <MetricCard
                            detail="Your personal planning aid."
                            label="Planning limit"
                            value={summary.planning_limit ?? 'Not set'}
                        />
                        <MetricCard
                            detail="Limit minus the legacy weighted total."
                            label="Remaining"
                            value={
                                summary.remaining_against_planning_limit ?? '—'
                            }
                        />
                    </div>
                </section>

                {overTargetWithPlans && (
                    <div
                        className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
                        role="alert"
                    >
                        <CircleAlert className="mt-0.5 size-5 shrink-0" />
                        <div>
                            <p className="font-semibold">
                                Planned travel is included in an over-target
                                projection.
                            </p>
                            <p className="mt-1 text-xs opacity-80">
                                The weighted projection is{' '}
                                {Math.abs(
                                    summary.remaining_against_planning_limit ??
                                        0,
                                )}{' '}
                                days above your personal {selectedYear} limit.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                        <h2 className="flex items-center gap-2 font-bold">
                            <Gauge className="size-5 text-emerald-700 dark:text-emerald-300" />
                            Weighted components
                        </h2>
                        <div className="mt-4 grid gap-2">
                            {weightedComponents.map((component) => (
                                <div
                                    key={component.year}
                                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-950"
                                >
                                    <p className="font-mono text-sm tabular-nums">
                                        {component.year}: {component.days}
                                        {component.divisor === 1
                                            ? ' × 1'
                                            : ` ÷ ${component.divisor}`}
                                    </p>
                                    <p className="font-mono text-sm font-bold text-emerald-800 tabular-nums dark:text-emerald-300">
                                        → {component.weighted_days}
                                    </p>
                                </div>
                            ))}
                            <div className="flex items-center justify-between border-t border-stone-200 pt-3 font-bold dark:border-stone-800">
                                <span>Weighted total</span>
                                <span className="text-xl tabular-nums">
                                    {summary.legacy_weighted_total}
                                </span>
                            </div>
                        </div>
                    </section>
                    <section className="flex flex-col justify-between gap-5 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                        <div>
                            <h2 className="flex items-center gap-2 font-bold">
                                <Settings2 className="size-5 text-emerald-700 dark:text-emerald-300" />
                                Planning room
                            </h2>
                            <p className="mt-3 text-4xl font-black tracking-tight tabular-nums">
                                {summary.remaining_against_planning_limit ??
                                    '—'}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">
                                {summary.planning_limit === null
                                    ? 'Set a personal limit to see remaining room.'
                                    : `Against a ${summary.planning_limit}-day limit using the legacy weighted basis.`}
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setError(null);
                                setPlanningOpen(true);
                            }}
                        >
                            <Settings2 /> Edit planning target
                        </Button>
                    </section>
                </div>

                <section className="grid gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase">
                                What produces the totals
                            </p>
                            <h2 className="text-2xl font-black tracking-tight">
                                Trips touching {selectedYear}
                            </h2>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setCsvOpen(true)}
                            >
                                <FileSpreadsheet /> CSV
                            </Button>
                            <Button
                                className="bg-emerald-800 text-white hover:bg-emerald-700"
                                onClick={openNewTrip}
                            >
                                <Plus /> Add trip
                            </Button>
                        </div>
                    </div>
                    {trips.length === 0 ? (
                        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center dark:border-stone-700 dark:bg-stone-900/50">
                            <div className="max-w-sm">
                                <CalendarDays className="mx-auto size-9 text-stone-400" />
                                <h3 className="mt-3 font-bold">
                                    No travel touches {selectedYear}
                                </h3>
                                <p className="mt-1 text-sm text-stone-500">
                                    Viewing a year never creates records.
                                </p>
                                <Button
                                    className="mt-4 bg-emerald-800 text-white hover:bg-emerald-700"
                                    onClick={openNewTrip}
                                >
                                    <Plus /> Add first trip
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {trips.map((trip) => (
                                <article
                                    key={trip.id}
                                    className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center dark:border-stone-800 dark:bg-stone-900"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge
                                                className={
                                                    trip.phase === 'planned'
                                                        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'
                                                        : trip.phase ===
                                                            'current'
                                                          ? 'border-emerald-600 bg-emerald-700 text-white'
                                                          : 'border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
                                                }
                                                variant="outline"
                                            >
                                                {phaseLabels[trip.phase]}
                                            </Badge>
                                            <span className="text-xs text-stone-500">
                                                Trip #{trip.id}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-base font-bold">
                                            {formatDateOnly(trip.entry_date)} →{' '}
                                            {formatDateOnly(trip.exit_date)}
                                        </p>
                                        {trip.notes && (
                                            <p className="mt-2 line-clamp-2 text-sm text-stone-500">
                                                {trip.notes}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                                        <div className="text-right">
                                            <p className="text-2xl font-black tabular-nums">
                                                {trip.contribution_days}
                                            </p>
                                            <p className="text-xs text-stone-500">
                                                days in {selectedYear}
                                            </p>
                                            {trip.actual_days !==
                                                trip.contribution_days && (
                                                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                                                    {trip.actual_days} actual
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            aria-label={`Edit trip ${formatDateOnly(trip.entry_date)} to ${formatDateOnly(trip.exit_date)}`}
                                            size="icon"
                                            variant="outline"
                                            onClick={() => openTrip(trip)}
                                        >
                                            <Pencil />
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    <p className="rounded-xl bg-stone-100 p-3 text-xs text-stone-500 dark:bg-stone-900">
                        A trip crossing New Year stays one trip. Each year shows
                        only the calendar days that trip contributes to it.
                    </p>
                </section>
                <footer className="border-t border-stone-200 pt-5 text-xs text-stone-500 dark:border-stone-800">
                    This utility reports your records and personal planning
                    target. It does not provide legal or tax conclusions.
                </footer>
            </div>

            <TripEditor
                key={`${tripEditorOpen}-${editingTrip?.id ?? 'new'}-${selectedYear}`}
                error={error}
                open={tripEditorOpen}
                saving={saving}
                selectedYear={selectedYear}
                today={today}
                trip={editingTrip}
                trips={trips}
                onDelete={deleteTrip}
                onOpenChange={setTripEditorOpen}
                onSave={saveTrip}
            />
            <PlanningEditor
                key={`${planningOpen}-${selectedYear}`}
                error={error}
                open={planningOpen}
                planning={planning}
                saving={saving}
                selectedYear={selectedYear}
                onOpenChange={setPlanningOpen}
                onSave={savePlanning}
            />
            <CsvTransfer
                open={csvOpen}
                onImported={() => router.reload()}
                onOpenChange={setCsvOpen}
            />
        </>
    );
}
