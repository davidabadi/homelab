import { Head } from '@inertiajs/react';
import {
    ArchiveRestore,
    CircleAlert,
    Database,
    Plus,
    RefreshCw,
    SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    show,
    exportMethod,
} from '@/actions/App/Http/Controllers/ScheduleBoardController';
import { store as importBoard } from '@/actions/App/Http/Controllers/ScheduleBoardImportController';
import {
    destroy as destroyJob,
    store as storeJob,
    update as updateJob,
} from '@/actions/App/Http/Controllers/ScheduleJobController';
import {
    destroy as destroyResource,
    store as storeResource,
    update as updateResource,
} from '@/actions/App/Http/Controllers/ScheduleResourceController';
import { scheduleRequest, ScheduleApiError } from '@/components/schedule/api';
import { BackupRestore } from '@/components/schedule/backup-restore';
import { ConflictSummary } from '@/components/schedule/conflict-summary';
import { DayFilter } from '@/components/schedule/day-filter';
import { JobEditor } from '@/components/schedule/job-editor';
import { JobList } from '@/components/schedule/job-list';
import { ResourceManager } from '@/components/schedule/resource-manager';
import { ResourceUtilization } from '@/components/schedule/resource-utilization';
import { ScheduleTimeline } from '@/components/schedule/schedule-timeline';
import type {
    DayFilterValue,
    PersistenceState,
    ScheduleBoard,
    ScheduleJob,
    ScheduleJobInput,
    ScheduleResource,
} from '@/components/schedule/types';
import { Button } from '@/components/ui/button';

type JobResponse = { job: ScheduleJob };
type ResourceResponse = { resource: ScheduleResource };

function errorMessage(error: unknown): string {
    if (error instanceof ScheduleApiError) {
        const firstValidationError = Object.values(error.errors).flat()[0];

        return firstValidationError ?? error.message;
    }

    return error instanceof Error
        ? error.message
        : 'The schedule could not be saved.';
}

function PersistenceBadge({ state }: { state: PersistenceState }) {
    const presentation = {
        idle: ['Ready', 'text-slate-400'],
        saving: ['Saving…', 'text-amber-300'],
        saved: ['Saved', 'text-emerald-300'],
        failed: ['Save failed', 'text-pink-300'],
    }[state];

    return (
        <span
            aria-live="polite"
            className={`flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 font-mono text-xs ${presentation[1]}`}
        >
            <span
                className={`size-1.5 rounded-full ${state === 'failed' ? 'bg-pink-400' : state === 'saved' ? 'bg-emerald-400' : state === 'saving' ? 'animate-pulse bg-amber-300' : 'bg-slate-500'}`}
            />
            {presentation[0]}
        </span>
    );
}

export default function ScheduleIndex() {
    const [board, setBoard] = useState<ScheduleBoard | null>(null);
    const [activeDay, setActiveDay] = useState<DayFilterValue>('all');
    const [persistence, setPersistence] = useState<PersistenceState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
    const [jobEditorOpen, setJobEditorOpen] = useState(false);
    const [editingJob, setEditingJob] = useState<ScheduleJob | null>(null);
    const [resourceManagerOpen, setResourceManagerOpen] = useState(false);
    const [backupOpen, setBackupOpen] = useState(false);
    const [backupJson, setBackupJson] = useState('');
    const [dialogError, setDialogError] = useState<string | null>(null);

    const loadBoard = useCallback(async () => {
        try {
            const loaded = await scheduleRequest<ScheduleBoard>(show.url());
            setBoard(loaded);
            setError(null);
            setRetry(null);
        } catch (caught) {
            const message = errorMessage(caught);
            setError(message);
            setRetry(() => loadBoard);
        }
    }, []);

    useEffect(() => {
        void loadBoard();
    }, [loadBoard]);

    function beginSave() {
        setPersistence('saving');
        setDialogError(null);
        setError(null);
    }

    function saveSucceeded() {
        setPersistence('saved');
        setRetry(null);
        window.setTimeout(
            () =>
                setPersistence((current) =>
                    current === 'saved' ? 'idle' : current,
                ),
            2500,
        );
    }

    function saveFailed(caught: unknown, retryAction: () => Promise<void>) {
        const message = errorMessage(caught);
        setPersistence('failed');
        setError(message);
        setDialogError(message);
        setRetry(() => retryAction);
    }

    function openAddJob() {
        setEditingJob(null);
        setDialogError(null);
        setJobEditorOpen(true);
    }

    function openEditJob(job: ScheduleJob) {
        setEditingJob(job);
        setDialogError(null);
        setJobEditorOpen(true);
    }

    async function saveJob(input: ScheduleJobInput): Promise<void> {
        const action = async () => saveJob(input);
        beginSave();

        if (!editingJob) {
            try {
                const response = await scheduleRequest<JobResponse>(
                    storeJob.url(),
                    { method: 'POST', body: JSON.stringify(input) },
                );
                setBoard((current) =>
                    current
                        ? { ...current, jobs: [...current.jobs, response.job] }
                        : current,
                );
                void loadBoard();
                saveSucceeded();
                setJobEditorOpen(false);
            } catch (caught) {
                saveFailed(caught, action);
            }

            return;
        }

        const previousBoard = board;
        setBoard((current) =>
            current
                ? {
                      ...current,
                      jobs: current.jobs.map((job) =>
                          job.id === editingJob.id
                              ? { ...input, id: job.id }
                              : job,
                      ),
                  }
                : current,
        );

        try {
            const response = await scheduleRequest<JobResponse>(
                updateJob.url(editingJob.id),
                { method: 'PUT', body: JSON.stringify(input) },
            );
            setBoard((current) =>
                current
                    ? {
                          ...current,
                          jobs: current.jobs.map((job) =>
                              job.id === response.job.id ? response.job : job,
                          ),
                      }
                    : current,
            );
            void loadBoard();
            saveSucceeded();
            setJobEditorOpen(false);
        } catch (caught) {
            setBoard(previousBoard);
            saveFailed(caught, action);
        }
    }

    async function deleteJob(job: ScheduleJob): Promise<void> {
        if (!window.confirm(`Delete “${job.name}”? This cannot be undone.`)) {
            return;
        }

        const action = async () => deleteJob(job);
        const previousBoard = board;
        beginSave();
        setBoard((current) =>
            current
                ? {
                      ...current,
                      jobs: current.jobs.filter((item) => item.id !== job.id),
                  }
                : current,
        );

        try {
            await scheduleRequest<void>(destroyJob.url(job.id), {
                method: 'DELETE',
            });
            void loadBoard();
            saveSucceeded();
            setJobEditorOpen(false);
        } catch (caught) {
            setBoard(previousBoard);
            saveFailed(caught, action);
        }
    }

    async function addResource(label: string, subtitle: string): Promise<void> {
        const action = async () => addResource(label, subtitle);
        beginSave();

        try {
            const response = await scheduleRequest<ResourceResponse>(
                storeResource.url(),
                {
                    method: 'POST',
                    body: JSON.stringify({
                        label: label.trim(),
                        subtitle: subtitle.trim() || null,
                    }),
                },
            );
            setBoard((current) =>
                current
                    ? {
                          ...current,
                          resources: [...current.resources, response.resource],
                      }
                    : current,
            );
            saveSucceeded();
        } catch (caught) {
            saveFailed(caught, action);
        }
    }

    async function editResource(resource: ScheduleResource): Promise<void> {
        const original = board?.resources.find(
            (item) => item.id === resource.id,
        );

        if (
            original?.label === resource.label &&
            original.subtitle === resource.subtitle
        ) {
            return;
        }

        const action = async () => editResource(resource);
        const previousBoard = board;
        beginSave();
        setBoard((current) =>
            current
                ? {
                      ...current,
                      resources: current.resources.map((item) =>
                          item.id === resource.id ? resource : item,
                      ),
                  }
                : current,
        );

        try {
            const response = await scheduleRequest<ResourceResponse>(
                updateResource.url(resource.id),
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        label: resource.label,
                        subtitle: resource.subtitle,
                    }),
                },
            );
            setBoard((current) =>
                current
                    ? {
                          ...current,
                          resources: current.resources.map((item) =>
                              item.id === resource.id
                                  ? response.resource
                                  : item,
                          ),
                      }
                    : current,
            );
            saveSucceeded();
        } catch (caught) {
            setBoard(previousBoard);
            saveFailed(caught, action);
        }
    }

    async function deleteResource(resource: ScheduleResource): Promise<void> {
        const usage =
            board?.jobs.filter((job) => job.resources.includes(resource.id))
                .length ?? 0;

        if (
            !window.confirm(
                `Delete “${resource.label}”? It is assigned to ${usage} job${usage === 1 ? '' : 's'}.`,
            )
        ) {
            return;
        }

        const action = async () => deleteResource(resource);
        const previousBoard = board;
        beginSave();
        setBoard((current) =>
            current
                ? {
                      ...current,
                      resources: current.resources.filter(
                          (item) => item.id !== resource.id,
                      ),
                      jobs: current.jobs.map((job) => ({
                          ...job,
                          resources: job.resources.filter(
                              (id) => id !== resource.id,
                          ),
                      })),
                  }
                : current,
        );

        try {
            await scheduleRequest<void>(destroyResource.url(resource.id), {
                method: 'DELETE',
            });
            void loadBoard();
            saveSucceeded();
        } catch (caught) {
            setBoard(previousBoard);
            saveFailed(caught, action);
        }
    }

    async function openBackup() {
        setDialogError(null);

        try {
            const response = await fetch(exportMethod.url(), {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error('The backup could not be loaded.');
            }

            setBackupJson(await response.text());
            setBackupOpen(true);
        } catch (caught) {
            setError(errorMessage(caught));
        }
    }

    async function restoreBoard(
        json: string,
        mode: 'merge' | 'replace',
    ): Promise<void> {
        const action = async () => restoreBoard(json, mode);
        beginSave();

        try {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            await scheduleRequest(importBoard.url(), {
                method: 'POST',
                body: JSON.stringify({ ...parsed, mode }),
            });
            await loadBoard();
            saveSucceeded();
            setBackupOpen(false);
        } catch (caught) {
            saveFailed(caught, action);
        }
    }

    return (
        <>
            <Head title="Schedule Board" />
            <div className="flex flex-col gap-5">
                <header className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950/65 p-4 backdrop-blur sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid size-11 place-items-center rounded-lg border border-amber-400/35 bg-amber-400/10 text-amber-300">
                            <Database aria-hidden="true" />
                        </span>
                        <div>
                            <p className="font-mono text-[10px] font-bold tracking-[0.26em] text-amber-300 uppercase">
                                Operations / recurring workload
                            </p>
                            <h1 className="text-2xl font-black tracking-tight text-slate-50 sm:text-3xl">
                                Schedule Board
                            </h1>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <PersistenceBadge state={persistence} />
                        <Button
                            className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800"
                            type="button"
                            variant="outline"
                            onClick={() => setResourceManagerOpen(true)}
                        >
                            <SlidersHorizontal /> Resources
                        </Button>
                        <Button
                            className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800"
                            type="button"
                            variant="outline"
                            onClick={() => void openBackup()}
                        >
                            <ArchiveRestore /> Backup / Restore
                        </Button>
                        <Button
                            className="bg-amber-400 font-bold text-slate-950 hover:bg-amber-300"
                            type="button"
                            onClick={openAddJob}
                        >
                            <Plus /> Add job
                        </Button>
                    </div>
                </header>

                {error && (
                    <div
                        className="flex flex-col gap-3 rounded-lg border border-pink-400/40 bg-pink-500/10 p-3 text-sm text-pink-100 sm:flex-row sm:items-center sm:justify-between"
                        role="alert"
                    >
                        <span className="flex items-center gap-2">
                            <CircleAlert
                                aria-hidden="true"
                                className="size-4 shrink-0"
                            />{' '}
                            {error}
                        </span>
                        {retry && (
                            <Button
                                className="border-pink-300/50 bg-transparent text-pink-100 hover:bg-pink-500/20"
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => void retry()}
                            >
                                <RefreshCw /> Retry
                            </Button>
                        )}
                    </div>
                )}

                <DayFilter value={activeDay} onChange={setActiveDay} />

                {!board ? (
                    <div className="grid min-h-64 place-items-center rounded-xl border border-slate-800 bg-slate-900/60 text-sm text-slate-500">
                        Loading schedule from Laravel…
                    </div>
                ) : (
                    <>
                        <ScheduleTimeline
                            activeDay={activeDay}
                            conflicts={board.conflicts}
                            jobs={board.jobs}
                            resources={board.resources}
                            onEdit={openEditJob}
                        />
                        <div className="grid gap-5 xl:grid-cols-2">
                            <ConflictSummary
                                activeDay={activeDay}
                                conflicts={board.conflicts}
                                jobs={board.jobs}
                                resources={board.resources}
                            />
                            <ResourceUtilization
                                activeDay={activeDay}
                                jobs={board.jobs}
                                resources={board.resources}
                            />
                        </div>
                        <JobList
                            activeDay={activeDay}
                            conflicts={board.conflicts}
                            jobs={board.jobs}
                            resources={board.resources}
                            onEdit={openEditJob}
                        />
                    </>
                )}
            </div>

            <JobEditor
                key={`${jobEditorOpen}-${editingJob?.id ?? 'new'}`}
                error={dialogError}
                job={editingJob}
                open={jobEditorOpen}
                resources={board?.resources ?? []}
                saving={persistence === 'saving'}
                onDelete={deleteJob}
                onOpenChange={setJobEditorOpen}
                onSave={saveJob}
            />
            <ResourceManager
                key={(board?.resources ?? [])
                    .map(
                        (resource) =>
                            `${resource.id}:${resource.label}:${resource.subtitle}`,
                    )
                    .join('|')}
                busy={persistence === 'saving'}
                error={dialogError}
                jobs={board?.jobs ?? []}
                open={resourceManagerOpen}
                resources={board?.resources ?? []}
                onAdd={addResource}
                onDelete={deleteResource}
                onOpenChange={setResourceManagerOpen}
                onUpdate={editResource}
            />
            <BackupRestore
                key={`${backupOpen}-${backupJson.length}`}
                boardJson={backupJson}
                busy={persistence === 'saving'}
                error={dialogError}
                open={backupOpen}
                onImport={restoreBoard}
                onOpenChange={setBackupOpen}
            />
        </>
    );
}
