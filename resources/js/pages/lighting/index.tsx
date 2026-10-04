import { Head, Link, router } from '@inertiajs/react';
import {
    BookOpen,
    Copy,
    Lightbulb,
    LoaderCircle,
    Pencil,
    Plus,
    Ruler,
    Trash2,
    Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
    lightingErrorMessage,
    lightingRequest,
} from '@/components/lighting/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { catalog } from '@/routes/lighting';
import {
    destroy,
    duplicate,
    edit,
    index,
    store,
    update,
} from '@/routes/lighting/designs';

type DesignSummary = {
    id: number;
    name: string;
    width_mm: number;
    height_mm: number;
    depth_mm: number | null;
    grid_size_mm: number;
    notes: string | null;
    components_count: number;
    connections_count: number;
    updated_at: string;
};

type DesignForm = {
    name: string;
    width_mm: string;
    height_mm: string;
    depth_mm: string;
};

const initialForm: DesignForm = {
    name: '',
    width_mm: '600',
    height_mm: '800',
    depth_mm: '',
};

export default function LightingIndex() {
    const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [dialog, setDialog] = useState<'new' | 'rename' | null>(null);
    const [selected, setSelected] = useState<DesignSummary | null>(null);
    const [form, setForm] = useState<DesignForm>(initialForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadDesigns = useCallback(async () => {
        try {
            const response = await lightingRequest<{
                designs: DesignSummary[];
            }>(index.url());
            setDesigns(response.designs);
            setError(null);
        } catch (caught) {
            setError(lightingErrorMessage(caught));
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        lightingRequest<{ designs: DesignSummary[] }>(index.url(), {
            signal: controller.signal,
        })
            .then((response) => setDesigns(response.designs))
            .catch((caught: unknown) => {
                if (!controller.signal.aborted) {
                    setError(lightingErrorMessage(caught));
                }
            });

        return () => controller.abort();
    }, []);

    function openNew(): void {
        setSelected(null);
        setForm({ ...initialForm });
        setFormError(null);
        setDialog('new');
    }

    function openRename(design: DesignSummary): void {
        setSelected(design);
        setForm({
            name: design.name,
            width_mm: String(design.width_mm),
            height_mm: String(design.height_mm),
            depth_mm: design.depth_mm === null ? '' : String(design.depth_mm),
        });
        setFormError(null);
        setDialog('rename');
    }

    async function saveDesign(event: FormEvent): Promise<void> {
        event.preventDefault();
        setSaving(true);
        setFormError(null);

        try {
            const response = await lightingRequest<{ design: DesignSummary }>(
                selected ? update.url(selected.id) : store.url(),
                {
                    method: selected ? 'PATCH' : 'POST',
                    body: JSON.stringify(
                        selected
                            ? { name: form.name.trim() }
                            : {
                                  name: form.name.trim(),
                                  width_mm: Number(form.width_mm),
                                  height_mm: Number(form.height_mm),
                                  depth_mm: form.depth_mm
                                      ? Number(form.depth_mm)
                                      : null,
                                  grid_size_mm: 5,
                                  notes: null,
                              },
                    ),
                },
            );
            setDialog(null);

            if (selected) {
                await loadDesigns();
            } else {
                router.visit(edit.url(response.design.id));
            }
        } catch (caught) {
            setFormError(lightingErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    async function duplicateDesign(design: DesignSummary): Promise<void> {
        setBusyId(design.id);
        setError(null);

        try {
            await lightingRequest<{ design: DesignSummary }>(
                duplicate.url(design.id),
                { method: 'POST' },
            );
            await loadDesigns();
        } catch (caught) {
            setError(lightingErrorMessage(caught));
        } finally {
            setBusyId(null);
        }
    }

    async function deleteDesign(design: DesignSummary): Promise<void> {
        if (
            !window.confirm(
                `Delete “${design.name}” and all of its equipment and wiring? This cannot be undone.`,
            )
        ) {
            return;
        }

        setBusyId(design.id);
        setError(null);

        try {
            await lightingRequest<void>(destroy.url(design.id), {
                method: 'DELETE',
            });
            setDesigns(
                (current) =>
                    current?.filter((item) => item.id !== design.id) ?? [],
            );
        } catch (caught) {
            setError(lightingErrorMessage(caught));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <>
            <Head title="Lighting Panels" />
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
                <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                    <div className="flex flex-col gap-2">
                        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-amber-600 uppercase dark:text-amber-400">
                            <Lightbulb className="size-4" /> Lighting
                        </p>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            Panel designs
                        </h1>
                        <p className="max-w-lg text-sm text-muted-foreground">
                            Plan your enclosure, place real equipment, and
                            document every cable run.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline">
                            <Link href={catalog()}>
                                <BookOpen /> Component catalog
                            </Link>
                        </Button>
                        <Button onClick={openNew}>
                            <Plus /> New design
                        </Button>
                    </div>
                </header>
                {error && (
                    <div
                        role="alert"
                        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                        <span>{error}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadDesigns()}
                        >
                            Retry
                        </Button>
                    </div>
                )}
                {designs === null ? (
                    <div
                        role="status"
                        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        aria-label="Loading panel designs"
                    >
                        {[0, 1, 2].map((item) => (
                            <div
                                key={item}
                                className="h-56 animate-pulse rounded-xl bg-muted"
                            />
                        ))}
                    </div>
                ) : designs.length === 0 ? (
                    <section className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/20 p-8 text-center">
                        <div className="flex size-14 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Lightbulb className="size-7" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold">
                                Your first panel starts here
                            </h2>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                Create a design with your enclosure dimensions.
                                Equipment and cable routes will save
                                automatically.
                            </p>
                        </div>
                        <Button onClick={openNew}>
                            <Plus /> New design
                        </Button>
                    </section>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {designs.map((design) => (
                            <Card
                                key={design.id}
                                className="gap-4"
                                data-testid={`lighting-design-${design.id}`}
                            >
                                <CardHeader className="gap-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <Link
                                            href={edit(design.id)}
                                            className="text-lg font-semibold tracking-tight hover:underline"
                                        >
                                            {design.name}
                                        </Link>
                                        <Badge variant="secondary">
                                            <Ruler className="size-3" /> mm
                                        </Badge>
                                    </div>
                                    <p className="font-mono text-sm text-muted-foreground">
                                        {design.width_mm} × {design.height_mm}
                                        {design.depth_mm !== null
                                            ? ` × ${design.depth_mm}`
                                            : ''}{' '}
                                        mm
                                    </p>
                                </CardHeader>
                                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="font-semibold tabular-nums">
                                            {design.components_count}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Placed components
                                        </p>
                                    </div>
                                    <div>
                                        <p className="flex items-center gap-1.5 font-semibold tabular-nums">
                                            <Unplug className="size-3.5 text-muted-foreground" />
                                            {design.connections_count}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Connections
                                        </p>
                                    </div>
                                    <p className="col-span-2 text-xs text-muted-foreground">
                                        Updated{' '}
                                        {new Date(
                                            design.updated_at,
                                        ).toLocaleString(undefined, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        })}
                                    </p>
                                </CardContent>
                                <CardFooter className="flex flex-wrap gap-1.5 border-t pt-4">
                                    <Button asChild size="sm">
                                        <Link href={edit(design.id)}>Open</Link>
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyId !== null}
                                        onClick={() =>
                                            void duplicateDesign(design)
                                        }
                                        aria-label={`Duplicate ${design.name}`}
                                    >
                                        <Copy className="size-3.5" />
                                        <span className="sr-only sm:not-sr-only">
                                            Duplicate
                                        </span>
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-8"
                                        disabled={busyId !== null}
                                        onClick={() => openRename(design)}
                                        aria-label={`Rename ${design.name}`}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="ml-auto size-8 text-muted-foreground hover:text-destructive"
                                        disabled={busyId !== null}
                                        onClick={() =>
                                            void deleteDesign(design)
                                        }
                                        aria-label={`Delete ${design.name}`}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
            <Dialog
                open={dialog !== null}
                onOpenChange={(open) => !saving && !open && setDialog(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {dialog === 'rename'
                                ? 'Rename design'
                                : 'New panel design'}
                        </DialogTitle>
                        <DialogDescription>
                            {dialog === 'rename'
                                ? 'Choose a name that makes this option easy to find.'
                                : 'Set the physical size of your enclosure in millimeters.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={(event) => void saveDesign(event)}
                        className="grid gap-4"
                    >
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-design-name">Design name</Label>
                            <Input
                                id="new-design-name"
                                required
                                autoFocus
                                maxLength={255}
                                value={form.name}
                                placeholder="Main panel v1"
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        name: event.target.value,
                                    })
                                }
                            />
                        </div>
                        {dialog === 'new' && (
                            <div className="grid grid-cols-3 gap-3">
                                {(
                                    [
                                        'width_mm',
                                        'height_mm',
                                        'depth_mm',
                                    ] as const
                                ).map((field) => (
                                    <div key={field} className="grid gap-1.5">
                                        <Label htmlFor={`design-${field}`}>
                                            {field === 'width_mm'
                                                ? 'Width'
                                                : field === 'height_mm'
                                                  ? 'Height'
                                                  : 'Depth'}{' '}
                                            (mm)
                                        </Label>
                                        <Input
                                            id={`design-${field}`}
                                            type="number"
                                            min="1"
                                            max="10000"
                                            step="0.01"
                                            required={field !== 'depth_mm'}
                                            value={form[field]}
                                            placeholder={
                                                field === 'depth_mm'
                                                    ? 'Optional'
                                                    : undefined
                                            }
                                            onChange={(event) =>
                                                setForm({
                                                    ...form,
                                                    [field]: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                        {formError && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {formError}
                            </p>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={saving}
                                onClick={() => setDialog(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={saving || !form.name.trim()}
                            >
                                {saving && (
                                    <LoaderCircle className="animate-spin" />
                                )}
                                {dialog === 'rename'
                                    ? 'Save name'
                                    : 'Create design'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
