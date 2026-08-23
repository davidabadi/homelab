import { Head, useForm, usePoll } from '@inertiajs/react';
import {
    AlertTriangle,
    CheckCircle2,
    FileUp,
    LoaderCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { store } from '@/actions/App/Http/Controllers/Settings/YamtrackImportController';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ImportRun = {
    id: number;
    strategy: 'add_missing' | 'replace';
    status:
        | 'pending'
        | 'processing'
        | 'completed'
        | 'completed_with_errors'
        | 'failed';
    original_filename: string;
    total_rows: number | null;
    processed_rows: number;
    successful_rows: number;
    skipped_rows: number;
    failed_rows: number;
    shows_added: number;
    shows_removed: number;
    episodes_marked_watched: number;
    episodes_reset: number;
    movies_added: number;
    movies_removed: number;
    movies_marked_watched: number;
    movies_reset: number;
    started_at: string | null;
    completed_at: string | null;
    failure_message: string | null;
    error_summary: Array<{ row: number; reason: string }>;
};

type Props = { importRun: ImportRun | null };

const strategies = [
    {
        value: 'add_missing' as const,
        label: 'Add missing history',
        description:
            'Add shows, movies, and watched episodes from Yamtrack without removing or resetting anything already in Tracker.',
    },
    {
        value: 'replace' as const,
        label: 'Replace my Tracker history',
        description:
            'Make your Tracker library and watched history match this Yamtrack export. Tracker-only titles and watches will be removed.',
    },
];

export default function YamtrackImportPage({ importRun }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const form = useForm<{
        file: File | null;
        strategy: 'add_missing' | 'replace';
        replace_confirmed: boolean;
    }>({
        file: null,
        strategy: 'add_missing',
        replace_confirmed: false,
    });
    const active =
        importRun?.status === 'pending' || importRun?.status === 'processing';
    const { start, stop } = usePoll(
        2000,
        { only: ['importRun'] },
        { autoStart: false, keepAlive: true },
    );

    useEffect(() => {
        if (active) {
            start();
        } else {
            stop();
        }

        return stop;
    }, [active, start, stop]);

    function chooseFile(file: File | undefined) {
        form.setData('file', file ?? null);
        form.clearErrors('file');
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        form.submit(store(), {
            forceFormData: true,
            onSuccess: () => form.reset(),
        });
    }

    const rawPercentage = importRun?.total_rows
        ? Math.min(
              100,
              Math.round(
                  (importRun.processed_rows / importRun.total_rows) * 100,
              ),
          )
        : 0;
    const percentage = active ? Math.min(99, rawPercentage) : rawPercentage;

    return (
        <>
            <Head title="Import history" />
            <h1 className="sr-only">Import history</h1>

            <div className="space-y-6">
                <section className="space-y-6 rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-6">
                    <Heading
                        variant="small"
                        title="Import from Yamtrack"
                        description="Upload a Yamtrack CSV export. The file is processed privately in the background and removed when the import finishes."
                    />

                    <form className="space-y-6" onSubmit={submit}>
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                onDragEnter={() => setDragging(true)}
                                onDragLeave={() => setDragging(false)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setDragging(false);
                                    chooseFile(event.dataTransfer.files[0]);
                                }}
                                className={cn(
                                    'flex w-full flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    dragging
                                        ? 'border-emerald-400 bg-emerald-400/10'
                                        : 'border-border bg-background/40 hover:bg-accent/40',
                                )}
                            >
                                <FileUp className="size-8 text-emerald-400" />
                                <span className="font-medium">
                                    {form.data.file
                                        ? form.data.file.name
                                        : 'Choose a CSV or drop it here'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    CSV only, up to 20 MB
                                </span>
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".csv,text/csv"
                                className="sr-only"
                                onChange={(event) =>
                                    chooseFile(event.target.files?.[0])
                                }
                            />
                            <InputError message={form.errors.file} />
                        </div>

                        <fieldset className="space-y-3">
                            <legend className="text-sm font-medium">
                                Import strategy
                            </legend>
                            {strategies.map((strategy) => (
                                <label
                                    key={strategy.value}
                                    className={cn(
                                        'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                                        form.data.strategy === strategy.value
                                            ? 'border-emerald-400/70 bg-emerald-400/8'
                                            : 'border-border/70 hover:bg-accent/40',
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="strategy"
                                        value={strategy.value}
                                        checked={
                                            form.data.strategy ===
                                            strategy.value
                                        }
                                        onChange={() => {
                                            form.setData(
                                                'strategy',
                                                strategy.value,
                                            );

                                            if (strategy.value !== 'replace') {
                                                form.setData(
                                                    'replace_confirmed',
                                                    false,
                                                );
                                            }
                                        }}
                                        className="mt-1 accent-emerald-500"
                                    />
                                    <span className="space-y-1">
                                        <span className="block text-sm font-medium">
                                            {strategy.label}
                                        </span>
                                        <span className="block text-sm text-muted-foreground">
                                            {strategy.description}
                                        </span>
                                    </span>
                                </label>
                            ))}
                            <InputError message={form.errors.strategy} />
                        </fieldset>

                        {form.data.strategy === 'replace' && (
                            <Alert variant="destructive">
                                <AlertTriangle />
                                <AlertTitle>
                                    This replaces your history
                                </AlertTitle>
                                <AlertDescription className="space-y-3">
                                    <p>
                                        Tracker-only titles and watches will be
                                        removed, and rewatch counts may be
                                        reduced to one. Shared metadata and
                                        every other user remain untouched.
                                    </p>
                                    <label className="flex items-start gap-2 text-sm font-medium">
                                        <input
                                            type="checkbox"
                                            checked={
                                                form.data.replace_confirmed
                                            }
                                            onChange={(event) =>
                                                form.setData(
                                                    'replace_confirmed',
                                                    event.target.checked,
                                                )
                                            }
                                            className="mt-0.5 accent-destructive"
                                        />
                                        I understand this will replace my
                                        Tracker history.
                                    </label>
                                    <InputError
                                        message={form.errors.replace_confirmed}
                                    />
                                </AlertDescription>
                            </Alert>
                        )}

                        <Button
                            type="submit"
                            disabled={
                                form.processing || active || !form.data.file
                            }
                        >
                            {form.processing && (
                                <LoaderCircle className="animate-spin" />
                            )}
                            {active ? 'Import in progress' : 'Import'}
                        </Button>
                    </form>
                </section>

                {importRun && (
                    <ImportStatus
                        importRun={importRun}
                        percentage={percentage}
                    />
                )}
            </div>
        </>
    );
}

function ImportStatus({
    importRun,
    percentage,
}: {
    importRun: ImportRun;
    percentage: number;
}) {
    const active =
        importRun.status === 'pending' || importRun.status === 'processing';
    const finalizing =
        active &&
        importRun.total_rows !== null &&
        importRun.processed_rows >= importRun.total_rows;
    const summary = [
        ['Shows added', importRun.shows_added],
        ['Shows removed', importRun.shows_removed],
        ['Episodes marked watched', importRun.episodes_marked_watched],
        ['Episodes reset', importRun.episodes_reset],
        ['Movies added', importRun.movies_added],
        ['Movies removed', importRun.movies_removed],
        ['Movies marked watched', importRun.movies_marked_watched],
        ['Movies reset', importRun.movies_reset],
        ['Rows skipped', importRun.skipped_rows],
        ['Rows failed', importRun.failed_rows],
    ] as const;

    return (
        <section className="space-y-5 rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
                <Heading
                    variant="small"
                    title="Latest import"
                    description={`${importRun.original_filename} · ${importRun.strategy === 'replace' ? 'Replace history' : 'Add missing history'}`}
                />
                <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium capitalize">
                    {importRun.status.replaceAll('_', ' ')}
                </span>
            </div>

            {active && (
                <div className="space-y-2">
                    <div className="flex justify-between gap-4 text-sm text-muted-foreground">
                        <span>
                            {importRun.status === 'pending'
                                ? 'Waiting for the queue worker'
                                : finalizing
                                  ? 'Finalizing import'
                                  : 'Resolving media'}
                        </span>
                        <span>
                            {importRun.processed_rows.toLocaleString()}
                            {importRun.total_rows !== null &&
                                ` / ${importRun.total_rows.toLocaleString()}`}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-accent">
                        <div
                            className="h-full rounded-full bg-emerald-400 transition-[width]"
                            style={{ width: `${percentage}%` }}
                        />
                    </div>
                    {importRun.started_at && (
                        <p className="text-xs text-muted-foreground">
                            Started{' '}
                            {new Date(importRun.started_at).toLocaleString()}
                        </p>
                    )}
                </div>
            )}

            {importRun.status === 'failed' && (
                <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Import failed</AlertTitle>
                    <AlertDescription>
                        {importRun.failure_message ??
                            'The import could not be completed.'}
                    </AlertDescription>
                </Alert>
            )}

            {importRun.status === 'completed_with_errors' && (
                <Alert>
                    <AlertTriangle />
                    <AlertTitle>Completed with some errors</AlertTitle>
                    <AlertDescription>
                        Valid rows were imported. Review the concise error list
                        below.
                    </AlertDescription>
                </Alert>
            )}

            {(importRun.status === 'completed' ||
                importRun.status === 'completed_with_errors') && (
                <>
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                        <CheckCircle2 className="size-4" />
                        {importRun.successful_rows.toLocaleString()} rows
                        imported
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {summary.map(([label, value]) => (
                            <div
                                key={label}
                                className="rounded-xl border border-border/60 bg-background/40 p-3"
                            >
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold">
                                    {value.toLocaleString()}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </>
            )}

            {importRun.error_summary.length > 0 && (
                <details className="rounded-xl border border-border/60 p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Error details ({importRun.error_summary.length} shown)
                    </summary>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {importRun.error_summary.map((error, index) => (
                            <li key={`${error.row}-${index}`}>
                                Row {error.row}: {error.reason}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
