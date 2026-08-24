import { Clipboard, Download, FileUp, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
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
    boardJson: string;
    busy: boolean;
    error: string | null;
    onOpenChange: (open: boolean) => void;
    onImport: (json: string, mode: 'merge' | 'replace') => Promise<void>;
};

export function BackupRestore({
    open,
    boardJson,
    busy,
    error,
    onOpenChange,
    onImport,
}: Props) {
    const [json, setJson] = useState(() => boardJson);
    const [mode, setMode] = useState<'merge' | 'replace'>('merge');
    const [hint, setHint] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    async function copy() {
        await navigator.clipboard.writeText(json);
        setHint('JSON copied to the clipboard.');
    }

    function download() {
        const url = URL.createObjectURL(
            new Blob([json], { type: 'application/json' }),
        );
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'homelab-schedule.json';
        anchor.click();
        URL.revokeObjectURL(url);
        setHint('Backup downloaded.');
    }

    async function loadFile(file: File | undefined) {
        if (!file) {
            return;
        }

        setJson(await file.text());
        setHint(
            'File loaded. Review it, choose merge or replace, then restore.',
        );
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => !busy && onOpenChange(next)}
        >
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto border-slate-700 bg-slate-900 text-slate-100 sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Backup / Restore</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Copy or download portable version 3 JSON. Imports are
                        validated by Laravel before any records change.
                    </DialogDescription>
                </DialogHeader>
                <label className="grid gap-2 text-sm font-medium">
                    Schedule JSON
                    <textarea
                        className="min-h-72 resize-y rounded-md border border-slate-600 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200 outline-none focus:border-amber-400"
                        spellCheck={false}
                        value={json}
                        onChange={(event) => setJson(event.target.value)}
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <Button
                        className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"
                        type="button"
                        variant="outline"
                        onClick={() => void copy()}
                    >
                        <Clipboard /> Copy JSON
                    </Button>
                    <Button
                        className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"
                        type="button"
                        variant="outline"
                        onClick={download}
                    >
                        <Download /> Download
                    </Button>
                    <input
                        ref={fileInput}
                        accept="application/json,.json"
                        className="hidden"
                        type="file"
                        onChange={(event) =>
                            void loadFile(event.target.files?.[0])
                        }
                    />
                    <Button
                        className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"
                        type="button"
                        variant="outline"
                        onClick={() => fileInput.current?.click()}
                    >
                        <FileUp /> Load file
                    </Button>
                </div>
                <fieldset className="flex flex-wrap gap-4 text-sm">
                    <legend className="mb-2 font-medium">
                        Restore behavior
                    </legend>
                    <label className="flex items-center gap-2">
                        <input
                            checked={mode === 'merge'}
                            className="accent-amber-400"
                            name="import-mode"
                            type="radio"
                            onChange={() => setMode('merge')}
                        />{' '}
                        Merge by portable IDs
                    </label>
                    <label className="flex items-center gap-2">
                        <input
                            checked={mode === 'replace'}
                            className="accent-amber-400"
                            name="import-mode"
                            type="radio"
                            onChange={() => setMode('replace')}
                        />{' '}
                        Replace entire board
                    </label>
                </fieldset>
                {(hint || error) && (
                    <p
                        className={`rounded-md border p-3 text-sm ${error ? 'border-pink-400/40 bg-pink-500/10 text-pink-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'}`}
                        role="status"
                    >
                        {error ?? hint}
                    </p>
                )}
                <DialogFooter>
                    <Button
                        className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800"
                        disabled={busy}
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Close
                    </Button>
                    <Button
                        className="bg-amber-400 text-slate-950 hover:bg-amber-300"
                        disabled={busy || !json.trim()}
                        type="button"
                        onClick={() => void onImport(json, mode)}
                    >
                        <RotateCcw />{' '}
                        {busy ? 'Restoring…' : 'Restore from JSON'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
