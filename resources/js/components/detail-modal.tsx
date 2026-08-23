import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * The near-fullscreen overlay the show/movie detail modals render inside: a
 * true client-side modal layered over the current screen — the page behind
 * stays mounted and the nav shell (sidebar / bottom tab bar) stays visible.
 * Dismissed explicitly via the top-right X or Escape — clicking the backdrop
 * does NOT close it (too easy to lose a modal full of progress by accident);
 * the host component owns open/closed state.
 *
 * `escapeDisabled` lets a host with an inner dialog open (episode quick view,
 * a confirmation) claim Escape for that dialog instead of closing everything
 * at once.
 */
export function DetailModal({
    label,
    onClose,
    escapeDisabled = false,
    children,
}: {
    label: string;
    onClose: () => void;
    escapeDisabled?: boolean;
    children: React.ReactNode;
}) {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previouslyFocusedElement =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        modalRef.current
            ?.querySelector<HTMLElement>('button:not([disabled])')
            ?.focus();

        function handleKeydown(event: KeyboardEvent) {
            const nestedDialogOpen = document.querySelector(
                '[data-slot="dialog-content"][data-state="open"]',
            );

            if (
                event.key === 'Escape' &&
                !escapeDisabled &&
                !nestedDialogOpen
            ) {
                onClose();

                return;
            }

            if (event.key !== 'Tab' || nestedDialogOpen) {
                return;
            }

            const focusableElements = Array.from(
                modalRef.current?.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            ).filter((element) => element.getClientRects().length > 0);

            if (focusableElements.length === 0) {
                event.preventDefault();
                modalRef.current?.focus();

                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements.at(-1);

            if (
                (event.shiftKey && document.activeElement === firstElement) ||
                (!event.shiftKey && document.activeElement === lastElement)
            ) {
                event.preventDefault();
                (event.shiftKey ? lastElement : firstElement)?.focus();
            }
        }

        window.addEventListener('keydown', handleKeydown, true);

        return () => {
            window.removeEventListener('keydown', handleKeydown, true);
            previouslyFocusedElement?.focus();
        };
    }, [onClose, escapeDisabled]);

    return (
        <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="fixed inset-0 z-[60] md:left-60"
        >
            <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
            <div className="absolute inset-x-0 top-3 bottom-0 mx-auto max-w-3xl overflow-x-hidden overflow-y-auto rounded-t-2xl border border-border/60 bg-background pb-24 shadow-2xl md:inset-x-8 md:top-8 md:bottom-8 md:rounded-2xl md:pb-8">
                <div className="relative">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-full bg-background/60 backdrop-blur transition-colors hover:bg-background/80"
                    >
                        <X className="size-5" />
                    </button>
                    {children}
                </div>
            </div>
        </div>
    );
}

/**
 * Pulsing placeholder shown inside the modal while the detail payload loads.
 */
export function DetailModalSkeleton() {
    return (
        <div className="animate-pulse">
            <div className="h-64 rounded-t-2xl bg-muted md:h-72" />
            <div className="space-y-4 px-4 pt-5 md:px-6">
                <div className="h-8 rounded-lg bg-muted" />
                <div className="h-24 rounded-xl bg-muted" />
                <div className="h-14 rounded-xl bg-muted" />
                <div className="h-14 rounded-xl bg-muted" />
            </div>
        </div>
    );
}
