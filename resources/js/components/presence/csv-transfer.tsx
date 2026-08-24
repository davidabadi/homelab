import { Download, FileWarning, Upload } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import {
    exportMethod,
    preview,
    store,
} from '@/actions/App/Http/Controllers/PresenceCsvController';
import {
    presenceErrorMessage,
    presenceRequest,
} from '@/components/presence/api';
import type { CsvPreview } from '@/components/presence/types';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImported: () => void;
};

export function CsvTransfer({ open, onOpenChange, onImported }: Props) {
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<'append' | 'replace'>('append');
    const [result, setResult] = useState<CsvPreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [working, setWorking] = useState(false);

    function fileChanged(event: ChangeEvent<HTMLInputElement>): void {
        setFile(event.target.files?.[0] ?? null);
        setResult(null);
        setError(null);
    }

    function formData(includeHash = false): FormData {
        const data = new FormData();

        if (file) {
            data.append('csv', file);
        }

        data.append('mode', mode);

        if (includeHash && result) {
            data.append('preview_hash', result.preview_hash);
        }

        return data;
    }

    async function previewFile(): Promise<void> {
        if (!file) {
            setError('Choose a CSV file first.');

            return;
        }

        setWorking(true);
        setError(null);

        try {
            setResult(
                await presenceRequest<CsvPreview>(preview.url(), {
                    method: 'POST',
                    body: formData(),
                }),
            );
        } catch (caught) {
            setError(presenceErrorMessage(caught));
        } finally {
            setWorking(false);
        }
    }

    async function importFile(): Promise<void> {
        if (!file || !result?.valid) {
            return;
        }

        setWorking(true);
        setError(null);

        try {
            await presenceRequest(store.url(), {
                method: 'POST',
                body: formData(true),
            });
            onOpenChange(false);
            onImported();
        } catch (caught) {
            setError(presenceErrorMessage(caught));
        } finally {
            setWorking(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100svh-1rem)] overflow-y-auto border-emerald-950/15 bg-stone-50 text-stone-900 sm:max-w-3xl dark:border-emerald-300/20 dark:bg-stone-950 dark:text-stone-100">
                <DialogHeader>
                    <DialogTitle>CSV backup & migration</DialogTitle>
                    <DialogDescription>
                        Export a portable backup or preview a normalized CSV
                        before importing. No XLSX parser is required.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5">
                    <Button asChild variant="outline">
                        <a href={exportMethod.url()}>
                            <Download /> Export all trips as CSV
                        </a>
                    </Button>
                    <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
                        <div>
                            <p className="text-sm font-semibold">
                                Expected columns
                            </p>
                            <code className="mt-1 block overflow-x-auto rounded bg-stone-100 p-2 text-xs dark:bg-stone-950">
                                entry_date,exit_date,planned,notes
                            </code>
                            <p className="mt-2 text-xs text-stone-500">
                                Use YYYY-MM-DD dates. planned accepts
                                true/false, yes/no, 1/0, planned/confirmed.
                                Quote notes that contain commas.
                            </p>
                        </div>
                        <label className="grid gap-1.5 text-sm font-medium">
                            CSV file
                            <input
                                accept=".csv,.txt,text/csv,text/plain"
                                className="block min-h-11 rounded-lg border border-stone-300 bg-stone-50 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-800 file:px-3 file:py-1.5 file:text-white dark:border-stone-700 dark:bg-stone-950"
                                type="file"
                                onChange={fileChanged}
                            />
                        </label>
                        <fieldset className="grid gap-2">
                            <legend className="text-sm font-medium">
                                Import behavior
                            </legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {(
                                    [
                                        [
                                            'append',
                                            'Append',
                                            'Keep existing trips and add these rows.',
                                        ],
                                        [
                                            'replace',
                                            'Replace',
                                            'Delete your trips, then import these rows.',
                                        ],
                                    ] as const
                                ).map(([value, label, description]) => (
                                    <label
                                        key={value}
                                        className={`cursor-pointer rounded-lg border p-3 ${mode === value ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-400/10' : 'border-stone-300 dark:border-stone-700'}`}
                                    >
                                        <span className="flex items-center gap-2 text-sm font-semibold">
                                            <input
                                                checked={mode === value}
                                                className="accent-emerald-700"
                                                name="csv-mode"
                                                type="radio"
                                                onChange={() => {
                                                    setMode(value);
                                                    setResult(null);
                                                }}
                                            />
                                            {label}
                                        </span>
                                        <span className="mt-1 block pl-6 text-xs text-stone-500">
                                            {description}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <Button
                            className="bg-emerald-800 text-white hover:bg-emerald-700"
                            disabled={working || !file}
                            type="button"
                            onClick={() => void previewFile()}
                        >
                            <Upload /> {working ? 'Checking…' : 'Preview CSV'}
                        </Button>
                    </div>
                    {result && (
                        <div className="grid gap-3">
                            <div
                                className={`rounded-lg border p-3 text-sm ${result.valid ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200'}`}
                                role="status"
                            >
                                {result.valid
                                    ? `${result.valid_rows} rows are ready to import.`
                                    : `${result.valid_rows} of ${result.total_rows} rows are valid. Resolve the errors and preview again.`}
                                {result.errors.map((message) => (
                                    <p key={message}>{message}</p>
                                ))}
                            </div>
                            {result.rows.length > 0 && (
                                <div className="max-h-72 overflow-auto rounded-lg border border-stone-200 dark:border-stone-800">
                                    <table className="w-full min-w-160 text-left text-xs">
                                        <thead className="sticky top-0 bg-stone-100 dark:bg-stone-900">
                                            <tr>
                                                <th className="p-2">Row</th>
                                                <th className="p-2">Entry</th>
                                                <th className="p-2">
                                                    Departure
                                                </th>
                                                <th className="p-2">Status</th>
                                                <th className="p-2">Check</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.rows.map((row) => (
                                                <tr
                                                    key={row.row}
                                                    className="border-t border-stone-200 align-top dark:border-stone-800"
                                                >
                                                    <td className="p-2 font-mono">
                                                        {row.row}
                                                    </td>
                                                    <td className="p-2 font-mono">
                                                        {row.entry_date}
                                                    </td>
                                                    <td className="p-2 font-mono">
                                                        {row.exit_date}
                                                    </td>
                                                    <td className="p-2 capitalize">
                                                        {row.status}
                                                    </td>
                                                    <td className="p-2">
                                                        {row.errors.map(
                                                            (message) => (
                                                                <p
                                                                    key={
                                                                        message
                                                                    }
                                                                    className="text-rose-700 dark:text-rose-300"
                                                                >
                                                                    {message}
                                                                </p>
                                                            ),
                                                        )}
                                                        {row.warnings.map(
                                                            (message) => (
                                                                <p
                                                                    key={
                                                                        message
                                                                    }
                                                                    className="text-amber-700 dark:text-amber-300"
                                                                >
                                                                    {message}
                                                                </p>
                                                            ),
                                                        )}
                                                        {row.errors.length ===
                                                            0 &&
                                                            row.warnings
                                                                .length ===
                                                                0 && (
                                                                <span className="text-emerald-700 dark:text-emerald-300">
                                                                    Ready
                                                                </span>
                                                            )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                    {error && (
                        <p
                            className="flex gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            role="alert"
                        >
                            <FileWarning className="mt-0.5 size-4 shrink-0" />
                            {error}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <Button
                        className="bg-emerald-800 text-white hover:bg-emerald-700"
                        disabled={working || !result?.valid}
                        type="button"
                        onClick={() => void importFile()}
                    >
                        <Upload />
                        {working
                            ? 'Importing…'
                            : `${mode === 'replace' ? 'Replace with' : 'Import'} ${result?.valid_rows ?? 0} trips`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
