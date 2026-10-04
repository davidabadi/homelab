import { Head, Link } from '@inertiajs/react';
import {
    Archive,
    ArrowLeft,
    BookOpen,
    Pencil,
    Plus,
    Search,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    lightingErrorMessage,
    lightingRequest,
} from '@/components/lighting/api';
import { ComponentDefinitionEditor } from '@/components/lighting/component-definition-editor';
import { ComponentImage } from '@/components/lighting/component-image';
import type { ComponentDefinition } from '@/components/lighting/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { home } from '@/routes/lighting';
import { destroy, index, store } from '@/routes/lighting/definitions';
import { store as storeRevision } from '@/routes/lighting/definitions/revisions';

export default function LightingCatalog() {
    const [definitions, setDefinitions] = useState<
        ComponentDefinition[] | null
    >(null);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<ComponentDefinition | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const loadDefinitions = useCallback(async () => {
        try {
            const response = await lightingRequest<{
                definitions: ComponentDefinition[];
            }>(index.url());
            setDefinitions(response.definitions);
            setError(null);
        } catch (caught) {
            setError(lightingErrorMessage(caught));
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        lightingRequest<{ definitions: ComponentDefinition[] }>(index.url(), {
            signal: controller.signal,
        })
            .then((response) => setDefinitions(response.definitions))
            .catch((caught: unknown) => {
                if (!controller.signal.aborted) {
                    setError(lightingErrorMessage(caught));
                }
            });

        return () => controller.abort();
    }, []);

    function openEditor(definition: ComponentDefinition | null): void {
        setEditing(definition);
        setFormError(null);
        setEditorOpen(true);
    }

    async function saveDefinition(body: FormData): Promise<void> {
        setSaving(true);
        setFormError(null);

        try {
            await lightingRequest<{ definition: ComponentDefinition }>(
                editing ? storeRevision.url(editing.id) : store.url(),
                { method: 'POST', body },
            );
            setEditorOpen(false);
            await loadDefinitions();
        } catch (caught) {
            setFormError(lightingErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    async function archiveDefinition(
        definition: ComponentDefinition,
    ): Promise<void> {
        if (
            !window.confirm(
                `Archive “${definition.display_name}” from the component library? Existing panel placements will retain their catalog revisions.`,
            )
        ) {
            return;
        }

        setSaving(true);
        setError(null);

        try {
            await lightingRequest<void>(destroy.url(definition.id), {
                method: 'DELETE',
            });
            await loadDefinitions();
        } catch (caught) {
            setError(lightingErrorMessage(caught));
        } finally {
            setSaving(false);
        }
    }

    const categories = [
        ...new Set(
            (definitions ?? []).map((definition) => definition.category),
        ),
    ].sort();
    const visible = (definitions ?? []).filter(
        (definition) =>
            (category === 'all' || definition.category === category) &&
            `${definition.manufacturer} ${definition.model} ${definition.display_name} ${definition.sku ?? ''}`
                .toLowerCase()
                .includes(search.toLowerCase()),
    );

    return (
        <>
            <Head title="Component Catalog" />
            <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
                <header className="grid gap-4">
                    <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="w-fit px-0 text-muted-foreground hover:bg-transparent"
                    >
                        <Link href={home()}>
                            <ArrowLeft /> Panel designs
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-amber-600 uppercase dark:text-amber-400">
                                <BookOpen className="size-4" /> Lighting
                            </p>
                            <h1 className="text-3xl font-semibold tracking-tight">
                                Component catalog
                            </h1>
                            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                                Reusable equipment definitions with physical
                                dimensions, product images, and terminal
                                layouts.
                            </p>
                        </div>
                        <Button
                            onClick={() => openEditor(null)}
                            disabled={saving}
                        >
                            <Plus /> New component
                        </Button>
                    </div>
                </header>
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            aria-label="Search component catalog"
                            placeholder="Search by manufacturer, model, or part number…"
                            className="bg-background pl-9"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <label className="sr-only" htmlFor="catalog-category">
                        Category
                    </label>
                    <select
                        id="catalog-category"
                        className="h-9 rounded-md border bg-background px-3 text-sm sm:w-52"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                    >
                        <option value="all">All categories</option>
                        {categories.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                </div>
                {error && (
                    <div
                        role="alert"
                        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                        <span>{error}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void loadDefinitions()}
                        >
                            Retry
                        </Button>
                    </div>
                )}
                {definitions === null ? (
                    <div
                        role="status"
                        aria-label="Loading components"
                        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                    >
                        {[0, 1, 2].map((item) => (
                            <div
                                key={item}
                                className="h-60 animate-pulse rounded-xl bg-muted"
                            />
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
                        {definitions.length === 0
                            ? 'Create a component to start your reusable library.'
                            : 'No components match your search.'}
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {visible.map((definition) => (
                            <Card
                                key={definition.id}
                                className="gap-0 overflow-hidden py-0"
                            >
                                <div className="flex gap-3 p-4">
                                    <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border bg-white">
                                        <ComponentImage
                                            definition={definition}
                                        />
                                    </div>
                                    <div className="grid min-w-0 content-start gap-1.5">
                                        <Badge
                                            variant="secondary"
                                            className="w-fit text-[10px]"
                                        >
                                            {definition.category}
                                        </Badge>
                                        <h2 className="text-sm leading-snug font-semibold">
                                            {definition.display_name}
                                        </h2>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {definition.manufacturer} ·{' '}
                                            {definition.model}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            Revision {definition.revision}
                                        </p>
                                    </div>
                                </div>
                                <CardContent className="grid gap-3 px-4 pb-4">
                                    <p className="font-mono text-xs">
                                        {definition.width_mm} ×{' '}
                                        {definition.height_mm}
                                        {definition.depth_mm === null
                                            ? ''
                                            : ` × ${definition.depth_mm}`}{' '}
                                        mm
                                    </p>
                                    {(definition.metadata.sample_dimensions ===
                                        true ||
                                        definition.metadata
                                            .dimensions_status ===
                                            'sample') && (
                                        <p className="text-xs text-amber-700 dark:text-amber-400">
                                            Sample dimensions — verify before
                                            fabrication.
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {definition.mounting_type} mounting ·{' '}
                                        {definition.terminals.length} terminals
                                    </p>
                                    <div className="flex justify-between gap-2 border-t pt-3">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={saving}
                                            onClick={() =>
                                                openEditor(definition)
                                            }
                                        >
                                            <Pencil className="size-3.5" /> New
                                            revision
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-8 text-muted-foreground"
                                            disabled={saving}
                                            aria-label={`Archive ${definition.display_name}`}
                                            onClick={() =>
                                                void archiveDefinition(
                                                    definition,
                                                )
                                            }
                                        >
                                            <Archive className="size-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
            {editorOpen && (
                <ComponentDefinitionEditor
                    definition={editing}
                    saving={saving}
                    error={formError}
                    onClose={() => setEditorOpen(false)}
                    onSave={saveDefinition}
                />
            )}
        </>
    );
}
