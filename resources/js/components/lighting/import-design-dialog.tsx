import { router } from '@inertiajs/react';
import { Check, FileJson, LoaderCircle, Plus, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { store as storeDefinition } from '@/routes/lighting/definitions';
import { edit } from '@/routes/lighting/designs';
import { preflight, store as storeImport } from '@/routes/lighting/imports';
import { lightingErrorMessage, lightingRequest } from './api';
import { ComponentDefinitionEditor } from './component-definition-editor';
import {
    catalogReferenceKey,
    importedDesignName,
    lightingImportMaxBytes,
    parseLightingInterchange,
} from './interchange';
import type {
    CatalogReference,
    CatalogResolution,
    ImportCatalogEntry,
    ImportPreflight,
    LightingInterchangeDocument,
} from './interchange';
import type { ComponentDefinition, LightingDesign } from './types';

export function ImportDesignDialog({ onClose }: { onClose: () => void }) {
    const [document, setDocument] =
        useState<LightingInterchangeDocument | null>(null);
    const [fileName, setFileName] = useState('');
    const [name, setName] = useState('');
    const [catalogCheck, setCatalogCheck] = useState<ImportPreflight | null>(
        null,
    );
    const [resolutions, setResolutions] = useState<CatalogResolution[]>([]);
    const [verified, setVerified] = useState(false);
    const [checking, setChecking] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState<ImportCatalogEntry | null>(null);
    const [savingComponent, setSavingComponent] = useState(false);
    const [createdCount, setCreatedCount] = useState(0);
    const [componentError, setComponentError] = useState<string | null>(null);
    const request = useRef<AbortController | null>(null);
    const fileSequence = useRef(0);
    const busy = checking || importing;

    useEffect(() => {
        return () => {
            fileSequence.current += 1;
            request.current?.abort();
        };
    }, []);

    async function checkCatalog(
        nextDocument: LightingInterchangeDocument,
        nextResolutions: CatalogResolution[],
    ): Promise<void> {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setChecking(true);
        setVerified(false);
        setError(null);

        try {
            const result = await lightingRequest<ImportPreflight>(
                preflight.url(),
                {
                    method: 'POST',
                    signal: controller.signal,
                    body: JSON.stringify({
                        document: nextDocument,
                        resolutions: nextResolutions,
                    }),
                },
            );

            if (!controller.signal.aborted) {
                setCatalogCheck(result);
                setVerified(true);
            }
        } catch (caught) {
            if (!controller.signal.aborted) {
                setError(lightingErrorMessage(caught));
            }
        } finally {
            if (!controller.signal.aborted) {
                setChecking(false);
            }
        }
    }

    async function chooseFile(file: File | undefined): Promise<void> {
        request.current?.abort();
        const sequence = ++fileSequence.current;
        setDocument(null);
        setCatalogCheck(null);
        setResolutions([]);
        setVerified(false);
        setName('');
        setFileName(file?.name ?? '');
        setError(null);

        if (!file) {
            setChecking(false);

            return;
        }

        if (file.size > lightingImportMaxBytes) {
            setChecking(false);
            setError('Choose a JSON design file smaller than 10 MB.');

            return;
        }

        setChecking(true);

        try {
            const contents = await file.text();

            if (sequence !== fileSequence.current) {
                return;
            }

            const parsed = parseLightingInterchange(contents);
            setDocument(parsed);
            setName(importedDesignName(parsed.design.name));
            await checkCatalog(parsed, []);
        } catch (caught) {
            if (sequence === fileSequence.current) {
                setError(lightingErrorMessage(caught));
                setChecking(false);
            }
        }
    }

    function updatedResolutions(
        reference: CatalogReference,
        definitionId: number | null,
    ): CatalogResolution[] {
        const key = catalogReferenceKey(reference);
        const next = resolutions.filter(
            (resolution) => catalogReferenceKey(resolution.catalog_ref) !== key,
        );

        if (definitionId !== null) {
            next.push({
                catalog_ref: reference,
                component_definition_id: definitionId,
            });
        }

        return next;
    }

    async function resolveDefinition(
        entry: ImportCatalogEntry,
        definitionId: number | null,
    ): Promise<void> {
        if (!document) {
            return;
        }

        const next = updatedResolutions(entry.catalog_ref, definitionId);
        setResolutions(next);
        await checkCatalog(document, next);
    }

    async function createDefinition(body: FormData): Promise<void> {
        if (!creating || !document) {
            return;
        }

        setSavingComponent(true);
        setComponentError(null);
        body.append('import_snapshot', JSON.stringify(creating.snapshot));

        try {
            const result = await lightingRequest<{
                definition: ComponentDefinition;
            }>(storeDefinition.url(), { method: 'POST', body });
            const next = updatedResolutions(
                creating.catalog_ref,
                result.definition.id,
            );
            setCreatedCount((count) => count + 1);
            setResolutions(next);
            setCreating(null);
            setCatalogCheck((current) =>
                current
                    ? {
                          ...current,
                          catalog: [...current.catalog, result.definition],
                      }
                    : current,
            );
            await checkCatalog(document, next);
        } catch (caught) {
            setComponentError(lightingErrorMessage(caught));
        } finally {
            setSavingComponent(false);
        }
    }

    async function importDesign(): Promise<void> {
        if (!document || !verified || !catalogCheck?.ready || !name.trim()) {
            return;
        }

        setImporting(true);
        setError(null);

        try {
            const result = await lightingRequest<{ design: LightingDesign }>(
                storeImport.url(),
                {
                    method: 'POST',
                    body: JSON.stringify({
                        document,
                        name: name.trim(),
                        resolutions,
                    }),
                },
            );
            router.visit(edit.url(result.design.id));
            onClose();
        } catch (caught) {
            setVerified(false);
            setError(lightingErrorMessage(caught));
        } finally {
            setImporting(false);
        }
    }

    const unresolved =
        catalogCheck?.entries.filter(
            (entry) =>
                entry.status === 'missing' || entry.status === 'conflict',
        ).length ?? 0;

    return (
        <>
            <Dialog
                open={!creating}
                onOpenChange={(open) => !open && !importing && onClose()}
            >
                <DialogContent
                    className="max-h-[calc(100svh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-2xl"
                    showCloseButton={!importing}
                >
                    <DialogHeader>
                        <DialogTitle>Import Design</DialogTitle>
                        <DialogDescription>
                            Import a lighting JSON file as a new panel design.
                            Review any missing catalog components before
                            continuing.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-5">
                        <div className="grid grid-cols-1 gap-2">
                            <Label htmlFor="lighting-import-file">
                                Design JSON file
                            </Label>
                            <Input
                                id="lighting-import-file"
                                type="file"
                                accept=".json,.lighting.json,application/json"
                                disabled={busy}
                                onChange={(event) =>
                                    void chooseFile(event.target.files?.[0])
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                .json or .lighting.json · up to 10 MB
                            </p>
                        </div>
                        {document && (
                            <>
                                <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                                    <FileJson className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                            {fileName}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {document.rows.length} rows ·{' '}
                                            {document.components.length} devices
                                            · {document.connections.length}{' '}
                                            connections
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-1.5">
                                    <Label htmlFor="lighting-import-name">
                                        New design name
                                    </Label>
                                    <Input
                                        id="lighting-import-name"
                                        maxLength={255}
                                        value={name}
                                        disabled={importing}
                                        onChange={(event) =>
                                            setName(event.target.value)
                                        }
                                    />
                                </div>
                            </>
                        )}
                        {checking && (
                            <p
                                role="status"
                                className="flex items-center gap-2 text-sm text-muted-foreground"
                            >
                                <LoaderCircle className="size-4 animate-spin" />{' '}
                                Checking design and catalog…
                            </p>
                        )}
                        {catalogCheck && (
                            <section
                                className="grid grid-cols-1 gap-3"
                                aria-label="Catalog resolution"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="text-sm font-semibold">
                                        Component catalog
                                    </h2>
                                    <Badge
                                        variant={
                                            unresolved ? 'outline' : 'secondary'
                                        }
                                    >
                                        {unresolved
                                            ? `${unresolved} to resolve`
                                            : 'All resolved'}
                                    </Badge>
                                </div>
                                {unresolved > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Create missing components from the
                                        export, or explicitly select a local
                                        definition. Review any physical
                                        differences; the layout and connections
                                        must remain valid.
                                    </p>
                                )}
                                {catalogCheck.entries.map((entry) => {
                                    const key = catalogReferenceKey(
                                        entry.catalog_ref,
                                    );
                                    const resolved =
                                        entry.status === 'exact' ||
                                        entry.status === 'resolved';
                                    const selectedId = resolutions.find(
                                        (resolution) =>
                                            catalogReferenceKey(
                                                resolution.catalog_ref,
                                            ) === key,
                                    )?.component_definition_id;

                                    return (
                                        <div
                                            key={key}
                                            className="grid grid-cols-1 gap-3 rounded-lg border p-3"
                                            data-testid={`import-catalog-${key}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-xs text-muted-foreground">
                                                        {
                                                            entry.snapshot
                                                                .manufacturer
                                                        }
                                                    </p>
                                                    <p className="text-sm font-medium">
                                                        {
                                                            entry.snapshot
                                                                .display_name
                                                        }
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {entry.snapshot.model} ·
                                                        revision{' '}
                                                        {
                                                            entry.snapshot
                                                                .revision
                                                        }
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                                        {
                                                            entry.snapshot
                                                                .width_mm
                                                        }{' '}
                                                        ×{' '}
                                                        {
                                                            entry.snapshot
                                                                .height_mm
                                                        }
                                                        {entry.snapshot
                                                            .depth_mm !== null
                                                            ? ` × ${entry.snapshot.depth_mm}`
                                                            : ''}{' '}
                                                        mm
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        resolved
                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                            : 'text-amber-700 dark:text-amber-400'
                                                    }
                                                >
                                                    {resolved && (
                                                        <Check className="size-3" />
                                                    )}
                                                    {entry.status === 'exact'
                                                        ? 'Matched'
                                                        : entry.status ===
                                                            'resolved'
                                                          ? 'Resolved'
                                                          : entry.status ===
                                                              'conflict'
                                                            ? 'Revision conflict'
                                                            : 'Missing'}
                                                </Badge>
                                            </div>
                                            {entry.message && (
                                                <p className="text-xs text-muted-foreground">
                                                    {entry.message}
                                                </p>
                                            )}
                                            {entry.status === 'resolved' &&
                                                entry.definition && (
                                                    <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                                                        Selected:{' '}
                                                        {
                                                            entry.definition
                                                                .display_name
                                                        }{' '}
                                                        · revision{' '}
                                                        {
                                                            entry.definition
                                                                .revision
                                                        }{' '}
                                                        ·{' '}
                                                        {
                                                            entry.definition
                                                                .width_mm
                                                        }{' '}
                                                        ×{' '}
                                                        {
                                                            entry.definition
                                                                .height_mm
                                                        }
                                                        {entry.definition
                                                            .depth_mm !== null
                                                            ? ` × ${entry.definition.depth_mm}`
                                                            : ''}{' '}
                                                        mm ·{' '}
                                                        {
                                                            entry.definition
                                                                .mounting_type
                                                        }
                                                    </p>
                                                )}
                                            {entry.status !== 'exact' && (
                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                    <select
                                                        aria-label={`Resolve ${entry.snapshot.display_name}`}
                                                        className="h-9 min-w-0 shrink-0 rounded-md border bg-background px-2 text-sm sm:flex-1"
                                                        value={selectedId ?? ''}
                                                        disabled={busy}
                                                        onChange={(event) =>
                                                            void resolveDefinition(
                                                                entry,
                                                                event.target
                                                                    .value
                                                                    ? Number(
                                                                          event
                                                                              .target
                                                                              .value,
                                                                      )
                                                                    : null,
                                                            )
                                                        }
                                                    >
                                                        <option value="">
                                                            Choose existing
                                                            catalog component…
                                                        </option>
                                                        {catalogCheck.catalog
                                                            .filter(
                                                                (definition) =>
                                                                    definition.kind ===
                                                                    entry
                                                                        .snapshot
                                                                        .kind,
                                                            )
                                                            .map(
                                                                (
                                                                    definition,
                                                                ) => (
                                                                    <option
                                                                        key={
                                                                            definition.id
                                                                        }
                                                                        value={
                                                                            definition.id
                                                                        }
                                                                    >
                                                                        {
                                                                            definition.display_name
                                                                        }{' '}
                                                                        · r
                                                                        {
                                                                            definition.revision
                                                                        }{' '}
                                                                        ·{' '}
                                                                        {
                                                                            definition.width_mm
                                                                        }{' '}
                                                                        ×{' '}
                                                                        {
                                                                            definition.height_mm
                                                                        }{' '}
                                                                        mm
                                                                    </option>
                                                                ),
                                                            )}
                                                    </select>
                                                    {!resolved && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() => {
                                                                setComponentError(
                                                                    null,
                                                                );
                                                                setCreating(
                                                                    entry,
                                                                );
                                                            }}
                                                        >
                                                            <Plus /> Create
                                                            component
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {catalogCheck.entries.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        This design does not require any catalog
                                        components.
                                    </p>
                                )}
                            </section>
                        )}
                        {error && (
                            <div
                                role="alert"
                                className="grid gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                            >
                                <p>{error}</p>
                                {document && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-fit"
                                        disabled={busy}
                                        onClick={() =>
                                            void checkCatalog(
                                                document,
                                                resolutions,
                                            )
                                        }
                                    >
                                        Check again
                                    </Button>
                                )}
                            </div>
                        )}
                        {createdCount > 0 && (
                            <p className="text-xs text-muted-foreground">
                                Components you create are saved to the catalog,
                                even if you cancel this import.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={importing}
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                busy ||
                                !verified ||
                                !catalogCheck?.ready ||
                                !name.trim()
                            }
                            onClick={() => void importDesign()}
                        >
                            {importing ? (
                                <LoaderCircle className="animate-spin" />
                            ) : (
                                <Upload />
                            )}
                            {importing ? 'Importing…' : 'Import new design'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {creating && (
                <ComponentDefinitionEditor
                    key={catalogReferenceKey(creating.catalog_ref)}
                    definition={null}
                    seed={creating.snapshot}
                    saving={savingComponent}
                    error={componentError}
                    onClose={() => setCreating(null)}
                    onSave={createDefinition}
                />
            )}
        </>
    );
}
