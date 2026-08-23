import { useHttp } from '@inertiajs/react';
import { ArrowLeft, Film, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

function LibrarySkeleton() {
    return (
        <div className="space-y-5 p-4 sm:p-6">
            <Skeleton className="mx-auto h-7 w-28 rounded-full" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {Array.from({ length: 12 }, (_, index) => (
                    <Skeleton key={index} className="aspect-2/3 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

export function FullScreenMediaLibrary<T>({
    open,
    title,
    endpoint,
    refreshKey,
    suspended = false,
    onClose,
    children,
}: {
    open: boolean;
    title: string;
    endpoint: string;
    refreshKey: number;
    suspended?: boolean;
    onClose: () => void;
    children: (payload: T) => React.ReactNode;
}) {
    const [payload, setPayload] = useState<T | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const { get } = useHttp({});

    useEffect(() => {
        if (!open) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        get(endpoint, {
            onSuccess: (response) => {
                setPayload(response as T);
                setFailed(false);
            },
            onHttpException: () => setFailed(true),
            onNetworkError: () => setFailed(true),
        });
        // Reload only when the overlay opens, the host reconciles a mutation,
        // or the user explicitly retries.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, endpoint, refreshKey, attempt]);

    function retry() {
        setFailed(false);
        setAttempt((value) => value + 1);
    }

    return (
        <Dialog
            open={open}
            modal={false}
            onOpenChange={(nextOpen) => {
                if (!nextOpen && !suspended) {
                    onClose();
                }
            }}
        >
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={(event) => {
                    if (suspended) {
                        event.preventDefault();
                    }
                }}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
                className="top-0! left-0! z-[55] block h-svh w-screen max-w-none! translate-x-0! translate-y-0! gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none md:top-6! md:left-[calc(50%+7.5rem)]! md:h-[calc(100svh-3rem)] md:w-[calc(100vw-17rem)] md:max-w-5xl! md:-translate-x-1/2! md:rounded-2xl md:border md:shadow-2xl"
            >
                <header className="flex h-16 shrink-0 items-center border-b border-border/70 bg-background/95 px-3 backdrop-blur sm:px-5">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={`Close ${title} library`}
                        className="flex size-10 items-center justify-center rounded-full transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <ArrowLeft className="size-5" />
                    </button>
                    <DialogTitle className="flex-1 pr-10 text-center text-lg">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Browse all tracked {title.toLocaleLowerCase()} grouped
                        by status.
                    </DialogDescription>
                </header>

                <div className="h-[calc(100%-4rem)] overflow-y-auto overscroll-contain pb-[max(env(safe-area-inset-bottom),1rem)]">
                    {payload === null && !failed ? (
                        <LibrarySkeleton />
                    ) : failed && payload === null ? (
                        <div className="flex min-h-full flex-col gap-3 p-4 sm:p-6">
                            <EmptyState
                                icon={Film}
                                title={`Could not load ${title.toLocaleLowerCase()}`}
                                description="Check your connection and try again."
                            />
                            <button
                                type="button"
                                onClick={retry}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                                <RefreshCw className="size-4" />
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {failed && (
                                <div className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:mx-6">
                                    <span>Could not refresh this library.</span>
                                    <button
                                        type="button"
                                        onClick={retry}
                                        className="inline-flex items-center gap-1.5 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <RefreshCw className="size-4" />
                                        Retry
                                    </button>
                                </div>
                            )}
                            {payload !== null && children(payload)}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
