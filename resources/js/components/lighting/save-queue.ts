export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed';
export type SaveState = {
    status: SaveStatus;
    error: unknown | null;
    dirty: boolean;
};
export type SaveAcknowledgement = {
    save_version: number;
    mutation_id: string;
    updated_at: string;
};
export type SaveMutation<T> = T & { base_version: number; mutation_id: string };

type SaveQueueOptions<T> = {
    request: (mutation: SaveMutation<T>) => Promise<SaveAcknowledgement>;
    onState: (state: SaveState) => void;
    onAcknowledged?: (acknowledgement: SaveAcknowledgement) => void;
    debounceMs?: number;
    createId?: () => string;
};

/** Serializes physical layout snapshots without replacing newer local edits. */
export class LightingSaveQueue<T extends object> {
    private snapshot: T;
    private version: number;
    private sequence = 0;
    private acknowledgedSequence = 0;
    private options: SaveQueueOptions<T>;
    private active: Promise<void> | null = null;
    private pending: { sequence: number; mutation: SaveMutation<T> } | null =
        null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private error: unknown | null = null;
    private disposed = false;

    constructor(snapshot: T, version: number, options: SaveQueueOptions<T>) {
        this.snapshot = snapshot;
        this.version = version;
        this.options = options;
    }

    get dirty(): boolean {
        return this.sequence !== this.acknowledgedSequence;
    }

    get saveVersion(): number {
        return this.version;
    }

    update(snapshot: T, immediate = false): void {
        this.snapshot = snapshot;
        this.sequence += 1;
        this.emit(this.active ? 'saving' : this.error ? 'failed' : 'dirty');
        this.clearTimer();

        if (this.error) {
            return;
        }

        if (immediate) {
            void this.flush().catch(() => undefined);
        } else {
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.flush().catch(() => undefined);
            }, this.options.debounceMs ?? 500);
        }
    }

    flush(): Promise<void> {
        this.clearTimer();

        if (this.active) {
            return this.active;
        }

        if (!this.dirty || this.disposed) {
            return Promise.resolve();
        }

        this.error = null;
        this.active = this.drain().finally(() => {
            this.active = null;
        });

        return this.active;
    }

    dispose(): void {
        this.disposed = true;
        this.clearTimer();
    }

    private async drain(): Promise<void> {
        while (this.dirty && !this.disposed) {
            const pending = this.pending ?? {
                sequence: this.sequence,
                mutation: {
                    ...structuredClone(this.snapshot),
                    base_version: this.version,
                    mutation_id:
                        this.options.createId?.() ?? crypto.randomUUID(),
                },
            };
            this.pending = pending;
            this.emit('saving');

            try {
                const ack = await this.options.request(pending.mutation);
                this.version = ack.save_version;
                this.acknowledgedSequence = pending.sequence;
                this.pending = null;
                this.options.onAcknowledged?.(ack);
            } catch (error) {
                this.error = error;

                // Validation is known not to have committed; a corrected snapshot may replace it.
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'status' in error &&
                    error.status === 422
                ) {
                    this.pending = null;
                }

                this.emit('failed');

                throw error;
            }
        }

        this.emit(this.dirty ? 'dirty' : 'saved');
    }

    private emit(status: SaveStatus): void {
        if (!this.disposed) {
            this.options.onState({
                status,
                error: this.error,
                dirty: this.dirty,
            });
        }
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
