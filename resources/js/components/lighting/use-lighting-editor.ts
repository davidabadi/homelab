import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { catalog, home } from '@/routes/lighting';
import { index as definitionIndex } from '@/routes/lighting/definitions';
import {
    destroy,
    edit,
    exportMethod,
    show,
    store,
} from '@/routes/lighting/designs';
import { update as saveLayout } from '@/routes/lighting/designs/layout';
import {
    lightingRequest,
    lightingErrorMessage,
    LightingApiError,
    downloadLightingJson,
} from './api';
import { defaultBundleRoute } from './external-cabling';
import {
    moveLayoutObject,
    reconcileRailAttachments,
    rerouteConnections,
} from './geometry';
import {
    deleteLayoutObjects,
    duplicateLayoutObject,
    layoutSnapshot,
    placeDefinition,
} from './layout-state';
import type { LightingSnapshot } from './layout-state';
import {
    insertPanelRow,
    movePanelDevice,
    movePanelRow,
    normalizePanelLayout,
    panelRowItems,
    placePanelDevice,
    removePanelRow,
    reorderPanelDevice,
} from './panel-layout';
import { LightingSaveQueue } from './save-queue';
import type { SaveAcknowledgement, SaveState } from './save-queue';
import type {
    CableBundle,
    CableEntry,
    ComponentDefinition,
    DesignConnection,
    DesignDuct,
    DesignRail,
    ExternalCable,
    LightingDesign,
    LightingLayout,
    LightingSelection,
    PanelCanvasApi,
    PlacedComponent,
} from './types';

type History = { past: LightingLayout[]; future: LightingLayout[] };

export function useLightingEditor(designId: number) {
    const [layout, setLayout] = useState<LightingLayout | null>(null);
    const [definitions, setDefinitions] = useState<ComponentDefinition[]>([]);
    const [selection, setSelection] = useState<LightingSelection>(null);
    const [activeRowId, setActiveRowId] = useState<string | null>(null);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [selectedObjects, setSelectedObjects] = useState<
        NonNullable<LightingSelection>[]
    >([]);
    const [persistence, setPersistence] = useState<SaveState>({
        status: 'saved',
        dirty: false,
        error: null,
    });
    const [loadError, setLoadError] = useState<string | null>(null);
    const [history, setHistory] = useState<History>({ past: [], future: [] });
    const [canvasApi, setCanvasApi] = useState<PanelCanvasApi | null>(null);
    const [zoom, setZoom] = useState(1);
    const [showGrid, setShowGrid] = useState(false);
    const [showWires, setShowWires] = useState(true);
    const [showLabels, setShowLabels] = useState(true);
    const [showExternalCabling, setShowExternalCabling] = useState(true);
    const [showCableLabels, setShowCableLabels] = useState(true);
    const [leaveDialog, setLeaveDialog] = useState(false);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [recoveryCleanupError, setRecoveryCleanupError] = useState<
        string | null
    >(null);
    const layoutRef = useRef<LightingLayout | null>(null);
    const committedRef = useRef<LightingLayout | null>(null);
    const queueRef = useRef<LightingSaveQueue<LightingSnapshot> | null>(null);
    const pendingNavigation = useRef<(() => void) | null>(null);
    const bypassNavigation = useRef(false);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([
            lightingRequest<LightingLayout>(show.url(designId)),
            lightingRequest<{ definitions: ComponentDefinition[] }>(
                definitionIndex.url(),
            ),
        ])
            .then(([loaded, catalogData]) => {
                if (cancelled) {
                    return;
                }

                const merged = new Map(
                    [...loaded.definitions, ...catalogData.definitions].map(
                        (definition) => [definition.id, definition],
                    ),
                );
                const initial = {
                    ...loaded,
                    definitions: [...merged.values()],
                };
                layoutRef.current = initial;
                committedRef.current = initial;
                setLayout(initial);
                setDefinitions(catalogData.definitions);
                queueRef.current = new LightingSaveQueue(
                    layoutSnapshot(initial),
                    initial.design.save_version,
                    {
                        request: (mutation) =>
                            lightingRequest<SaveAcknowledgement>(
                                saveLayout.url(designId),
                                {
                                    method: 'PUT',
                                    body: JSON.stringify(mutation),
                                },
                            ),
                        onState: setPersistence,
                        onAcknowledged: (ack) => {
                            const current = layoutRef.current;

                            if (current) {
                                const next = {
                                    ...current,
                                    design: {
                                        ...current.design,
                                        save_version: ack.save_version,
                                        updated_at: ack.updated_at,
                                    },
                                };
                                layoutRef.current = next;
                                setLayout(next);
                            }
                        },
                    },
                );
            })
            .catch((error) => {
                if (!cancelled) {
                    setLoadError(lightingErrorMessage(error));
                }
            });

        return () => {
            cancelled = true;
            queueRef.current?.dispose();
        };
    }, [designId]);

    const changeLayout = useCallback(
        (
            candidate: LightingLayout,
            commit = true,
            immediate = false,
        ): boolean => {
            let next: LightingLayout;

            try {
                next = normalizePanelLayout(candidate);
            } catch (caught) {
                setOperationError(lightingErrorMessage(caught));

                return false;
            }

            setOperationError(null);
            layoutRef.current = next;
            setLayout(next);

            if (!commit) {
                return true;
            }

            const previous = committedRef.current;

            if (
                previous &&
                JSON.stringify(layoutSnapshot(previous)) !==
                    JSON.stringify(layoutSnapshot(next))
            ) {
                setHistory((current) => ({
                    past: [...current.past, previous].slice(-50),
                    future: [],
                }));
                committedRef.current = next;
                queueRef.current?.update(layoutSnapshot(next), immediate);
            }

            return true;
        },
        [],
    );

    const hasUncommittedChanges = useCallback(() => {
        const current = layoutRef.current;
        const committed = committedRef.current;

        return (
            current !== null &&
            committed !== null &&
            JSON.stringify(layoutSnapshot(current)) !==
                JSON.stringify(layoutSnapshot(committed))
        );
    }, []);

    const hasUnsavedChanges = useCallback(
        () => hasUncommittedChanges() || Boolean(queueRef.current?.dirty),
        [hasUncommittedChanges],
    );

    const attemptNavigation = useCallback(
        async (action: () => void) => {
            pendingNavigation.current = action;
            setBusy(true);

            try {
                const current = layoutRef.current;

                if (current && hasUncommittedChanges()) {
                    changeLayout(current, true, true);
                }

                await queueRef.current?.flush();
                bypassNavigation.current = true;
                pendingNavigation.current = null;
                action();
            } catch {
                setLeaveDialog(true);
            } finally {
                setBusy(false);
            }
        },
        [changeLayout, hasUncommittedChanges],
    );

    useEffect(() => {
        const editorUrl = window.location.href;
        const editorHistory = window.history.state;
        const removeBefore = router.on('before', (event) => {
            if (!hasUnsavedChanges() || bypassNavigation.current) {
                return;
            }

            event.preventDefault();
            const visit = event.detail.visit;
            void attemptNavigation(() =>
                router.visit(visit.url, {
                    method: visit.method,
                    data: visit.data,
                    replace: visit.replace,
                    preserveScroll: visit.preserveScroll,
                }),
            );
        });
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (hasUnsavedChanges() && !bypassNavigation.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        const popstate = (event: PopStateEvent) => {
            if (!hasUnsavedChanges() || bypassNavigation.current) {
                return;
            }

            const destination = window.location.href;
            event.stopImmediatePropagation();
            window.history.replaceState(editorHistory, '', editorUrl);
            void attemptNavigation(() =>
                router.visit(destination, { replace: true }),
            );
        };
        window.addEventListener('beforeunload', beforeUnload);
        window.addEventListener('popstate', popstate, true);

        return () => {
            removeBefore();
            window.removeEventListener('beforeunload', beforeUnload);
            window.removeEventListener('popstate', popstate, true);
        };
    }, [attemptNavigation, hasUnsavedChanges]);

    const undo = useCallback(() => {
        const previous = history.past.at(-1);
        const current = layoutRef.current;

        if (!previous || !current) {
            return;
        }

        const restored = normalizePanelLayout({
            ...previous,
            design: {
                ...previous.design,
                save_version: current.design.save_version,
                updated_at: current.design.updated_at,
            },
        });
        setHistory({
            past: history.past.slice(0, -1),
            future: [current, ...history.future].slice(0, 50),
        });
        layoutRef.current = restored;
        committedRef.current = restored;
        setLayout(restored);
        setSelection(null);
        setSelectedObjects([]);
        queueRef.current?.update(layoutSnapshot(restored), true);
    }, [history]);

    const redo = useCallback(() => {
        const next = history.future[0];
        const current = layoutRef.current;

        if (!next || !current) {
            return;
        }

        const restored = normalizePanelLayout({
            ...next,
            design: {
                ...next.design,
                save_version: current.design.save_version,
                updated_at: current.design.updated_at,
            },
        });
        setHistory({
            past: [...history.past, current].slice(-50),
            future: history.future.slice(1),
        });
        layoutRef.current = restored;
        committedRef.current = restored;
        setLayout(restored);
        setSelection(null);
        setSelectedObjects([]);
        queueRef.current?.update(layoutSnapshot(restored), true);
    }, [history]);

    const deleteSelection = useCallback(
        (confirmed = false) => {
            const current = layoutRef.current;
            const objects = selectedObjects.length
                ? selectedObjects
                : selection
                  ? [selection]
                  : [];

            if (!current || !objects.length) {
                return;
            }

            if (
                objects.some(
                    (object) =>
                        object.type === 'rail' &&
                        panelRowItems(current, object.id).some(
                            (item) =>
                                !objects.some(
                                    (selected) =>
                                        selected.type === 'component' &&
                                        selected.id === item.portable_id,
                                ),
                        ),
                )
            ) {
                setOperationError(
                    'Only empty rows can be removed. Move or remove the devices first.',
                );

                return;
            }

            if (
                !confirmed &&
                objects.some(
                    (object) =>
                        object.type === 'cable_bundle' &&
                        current.external_cables.some(
                            (cable) => cable.bundle_portable_id === object.id,
                        ),
                )
            ) {
                setOperationError(
                    'Remove this bundle from its inspector to confirm deleting its member cables.',
                );

                return;
            }

            let next: LightingLayout;

            try {
                next = deleteLayoutObjects(current, objects);
            } catch (caught) {
                setOperationError(lightingErrorMessage(caught));

                return;
            }

            if (!changeLayout(next, true, true)) {
                return;
            }

            setSelection(null);
            setSelectedObjects([]);
        },
        [changeLayout, selectedObjects, selection],
    );

    const duplicateSelection = useCallback(
        (id?: string) => {
            const current = layoutRef.current;
            const selected = id
                ? { type: 'component' as const, id }
                : selection;

            if (!current || !selected) {
                return;
            }

            let result: ReturnType<typeof placePanelDevice>;
            const component =
                selected.type === 'component'
                    ? current.components.find(
                          (item) => item.portable_id === selected.id,
                      )
                    : undefined;
            const definition = current.definitions.find(
                (item) => item.id === component?.component_definition_id,
            );

            try {
                result =
                    component?.rail_portable_id && definition
                        ? placePanelDevice(
                              current,
                              definition,
                              component.rail_portable_id,
                          )
                        : duplicateLayoutObject(current, selected);

                if (component) {
                    result.layout.components = result.layout.components.map(
                        (item) =>
                            item.portable_id === result.selection?.id
                                ? {
                                      ...item,
                                      custom_label: component.custom_label,
                                      notes: component.notes,
                                      metadata: structuredClone(
                                          component.metadata,
                                      ),
                                  }
                                : item,
                    );
                }
            } catch (caught) {
                setOperationError(lightingErrorMessage(caught));

                return;
            }

            if (!changeLayout(result.layout, true, true)) {
                return;
            }

            setSelection(result.selection);
            setSelectedObjects(result.selection ? [result.selection] : []);
        },
        [changeLayout, selection],
    );

    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            const target = event.target;

            if (
                target instanceof HTMLElement &&
                target.closest(
                    'input, textarea, select, [contenteditable="true"], [role="dialog"]',
                )
            ) {
                return;
            }

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'z'
            ) {
                event.preventDefault();

                if (event.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'd'
            ) {
                event.preventDefault();
                duplicateSelection();
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                deleteSelection();
            }
        };
        window.addEventListener('keydown', keydown);

        return () => window.removeEventListener('keydown', keydown);
    }, [undo, redo, duplicateSelection, deleteSelection]);

    const addDefinition = useCallback(
        (
            definition: ComponentDefinition,
            rowId?: string,
            xMm?: number,
        ): boolean => {
            const current = layoutRef.current;

            if (!current) {
                return false;
            }

            const target =
                rowId ??
                (current.rails.some((row) => row.portable_id === activeRowId)
                    ? activeRowId
                    : current.rails[0]?.portable_id);

            if (!target) {
                setOperationError('Add a row before placing a device.');

                return false;
            }

            let result: ReturnType<typeof placePanelDevice>;

            try {
                result = placePanelDevice(current, definition, target, xMm);
            } catch (caught) {
                setOperationError(lightingErrorMessage(caught));

                return false;
            }

            if (!changeLayout(result.layout, true, true)) {
                return false;
            }

            setActiveRowId(target);
            setSelection(result.selection);
            setSelectedObjects(result.selection ? [result.selection] : []);

            return true;
        },
        [changeLayout, activeRowId],
    );

    function updateDesign(attributes: Partial<LightingDesign>) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                design: { ...current.design, ...attributes },
            });
        }
    }

    function updateComponent(id: string, attributes: Partial<PlacedComponent>) {
        const current = layoutRef.current;
        const component = current?.components.find(
            (item) => item.portable_id === id,
        );

        if (!current || !component) {
            return;
        }

        let next = current;

        if (
            component.rail_portable_id &&
            ('x_mm' in attributes || 'y_mm' in attributes)
        ) {
            next = rerouteConnections({
                ...current,
                components: current.components.map((item) =>
                    item.portable_id === id
                        ? { ...item, x_mm: attributes.x_mm ?? component.x_mm }
                        : item,
                ),
            });
        } else if ('x_mm' in attributes || 'y_mm' in attributes) {
            next = moveLayoutObject(
                current,
                { type: 'component', id },
                {
                    x_mm: attributes.x_mm ?? component.x_mm,
                    y_mm: attributes.y_mm ?? component.y_mm,
                },
                { snap: false },
            );
        }

        const otherAttributes = { ...attributes };
        delete otherAttributes.x_mm;
        delete otherAttributes.y_mm;
        next = {
            ...next,
            components: next.components.map((item) =>
                item.portable_id === id
                    ? { ...item, ...otherAttributes }
                    : item,
            ),
        };
        changeLayout(next);
    }

    function updateRail(id: string, attributes: Partial<DesignRail>) {
        const current = layoutRef.current;
        const rail = current?.rails.find((item) => item.portable_id === id);

        if (!current || !rail) {
            return;
        }

        let next = moveLayoutObject(
            current,
            { type: 'rail', id },
            {
                x_mm: attributes.x_mm ?? rail.x_mm,
                y_mm: attributes.y_mm ?? rail.y_mm,
            },
            { snap: false },
        );
        next = {
            ...next,
            rails: next.rails.map((item) =>
                item.portable_id === id ? { ...item, ...attributes } : item,
            ),
        };
        changeLayout(rerouteConnections(reconcileRailAttachments(next)));
    }

    function updateDuct(id: string, attributes: Partial<DesignDuct>) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                ducts: current.ducts.map((item) =>
                    item.portable_id === id ? { ...item, ...attributes } : item,
                ),
            });
        }
    }

    function updateConnection(
        id: string,
        attributes: Partial<DesignConnection>,
    ) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                connections: current.connections.map((item) =>
                    item.portable_id === id ? { ...item, ...attributes } : item,
                ),
            });
        }
    }

    function addCableEntry(): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        const entry: CableEntry = {
            portable_id: crypto.randomUUID(),
            label: 'Cable entry',
            side: 'top',
            offset_mm: Math.max(0, current.design.width_mm / 2 - 20),
            span_mm: Math.min(40, current.design.width_mm),
            entry_type: 'open_entry',
            notes: null,
            metadata: {},
        };

        if (
            !changeLayout(
                {
                    ...current,
                    cable_entries: [...current.cable_entries, entry],
                },
                true,
                true,
            )
        ) {
            return false;
        }

        selectObject({ type: 'cable_entry', id: entry.portable_id });

        return true;
    }

    function updateCableEntry(id: string, attributes: Partial<CableEntry>) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                cable_entries: current.cable_entries.map((item) =>
                    item.portable_id === id ? { ...item, ...attributes } : item,
                ),
            });
        }
    }

    function addCableBundle(entryId: string): boolean {
        const current = layoutRef.current;
        const entry = current?.cable_entries.find(
            (item) => item.portable_id === entryId,
        );

        if (!current || !entry) {
            return false;
        }

        const bundle: CableBundle = {
            portable_id: crypto.randomUUID(),
            cable_entry_portable_id: entryId,
            name: 'Cable bundle',
            external_location: null,
            cable_class: 'other',
            direction: 'mixed',
            display_color: null,
            planned_count: null,
            route_points: defaultBundleRoute(entry, current.design),
            notes: null,
            metadata: {},
        };

        if (
            !changeLayout(
                {
                    ...current,
                    cable_bundles: [...current.cable_bundles, bundle],
                },
                true,
                true,
            )
        ) {
            return false;
        }

        selectObject({ type: 'cable_bundle', id: bundle.portable_id });

        return true;
    }

    function updateCableBundle(id: string, attributes: Partial<CableBundle>) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                cable_bundles: current.cable_bundles.map((item) =>
                    item.portable_id === id ? { ...item, ...attributes } : item,
                ),
            });
        }
    }

    function addExternalCable(bundleId?: string, entryId?: string): boolean {
        const current = layoutRef.current;

        if (!current || (!bundleId && !entryId)) {
            return false;
        }

        const cable: ExternalCable = {
            portable_id: crypto.randomUUID(),
            bundle_portable_id: bundleId ?? null,
            cable_entry_portable_id: bundleId ? null : (entryId ?? null),
            label: 'External cable',
            cable_type: 'Field cable',
            gauge: null,
            conductor_count: 1,
            internal_component_portable_id: null,
            internal_terminal: null,
            branch_route_points: [],
            cable_class: bundleId ? null : 'other',
            direction: bundleId ? null : 'mixed',
            notes: null,
            metadata: {},
        };

        if (
            !changeLayout(
                {
                    ...current,
                    external_cables: [...current.external_cables, cable],
                },
                true,
                true,
            )
        ) {
            return false;
        }

        selectObject({ type: 'external_cable', id: cable.portable_id });

        return true;
    }

    function updateExternalCable(
        id: string,
        attributes: Partial<ExternalCable>,
    ) {
        const current = layoutRef.current;

        if (current) {
            changeLayout({
                ...current,
                external_cables: current.external_cables.map((item) => {
                    if (item.portable_id !== id) {
                        return item;
                    }

                    const next = { ...item, ...attributes };

                    if (
                        'bundle_portable_id' in attributes &&
                        attributes.bundle_portable_id
                    ) {
                        next.cable_entry_portable_id = null;
                        next.cable_class = null;
                        next.direction = null;
                    } else if (
                        'cable_entry_portable_id' in attributes &&
                        attributes.cable_entry_portable_id
                    ) {
                        next.bundle_portable_id = null;
                        next.cable_class ??= 'other';
                        next.direction ??= 'mixed';
                    }

                    if (
                        'internal_component_portable_id' in attributes &&
                        !attributes.internal_component_portable_id
                    ) {
                        next.internal_terminal = null;
                        next.branch_route_points = [];
                    }

                    return next;
                }),
            });
        }
    }

    async function saveAsNewDesign() {
        const current = layoutRef.current;

        if (!current) {
            return;
        }

        setBusy(true);
        setRecoveryCleanupError(null);
        let created: LightingDesign | null = null;
        let saved = false;

        try {
            const snapshot = layoutSnapshot(current);
            const response = await lightingRequest<{ design: LightingDesign }>(
                store.url(),
                {
                    method: 'POST',
                    body: JSON.stringify({
                        ...snapshot.design,
                        name: `${current.design.name} (recovered)`,
                    }),
                },
            );
            created = response.design;
            await lightingRequest<SaveAcknowledgement>(
                saveLayout.url(response.design.id),
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        ...snapshot,
                        design: {
                            ...snapshot.design,
                            name: response.design.name,
                        },
                        base_version: response.design.save_version,
                        mutation_id: crypto.randomUUID(),
                    }),
                },
            );
            saved = true;
            bypassNavigation.current = true;
            router.visit(edit(response.design.id));
        } catch (error) {
            if (created && !saved) {
                try {
                    const recovery = await lightingRequest<LightingLayout>(
                        show.url(created.id),
                    );
                    const empty =
                        recovery.components.length === 0 &&
                        recovery.ducts.length === 0 &&
                        recovery.connections.length === 0 &&
                        recovery.cable_entries.length === 0 &&
                        recovery.cable_bundles.length === 0 &&
                        recovery.external_cables.length === 0;

                    if (
                        empty &&
                        recovery.design.save_version === created.save_version
                    ) {
                        await lightingRequest<void>(destroy.url(created.id), {
                            method: 'DELETE',
                        });
                    }
                } catch (cleanupError) {
                    setRecoveryCleanupError(
                        `The temporary recovery design could not be cleaned up: ${lightingErrorMessage(cleanupError)}`,
                    );
                }
            }

            setPersistence({ status: 'failed', dirty: true, error });
        } finally {
            setBusy(false);
        }
    }

    const onInitApi = useCallback(
        (api: PanelCanvasApi) => setCanvasApi(api),
        [],
    );

    function selectRow(id: string) {
        setActiveRowId(id);
        setSelection({ type: 'rail', id });
        setSelectedObjects([]);
    }

    function selectObject(next: LightingSelection) {
        setSelection(next);
        setSelectedObjects(next ? [next] : []);

        const rowId =
            next?.type === 'rail'
                ? next.id
                : next?.type === 'component'
                  ? layoutRef.current?.components.find(
                        (item) => item.portable_id === next.id,
                    )?.rail_portable_id
                  : null;

        if (rowId) {
            setActiveRowId(rowId);
        }
    }

    function addRow(
        referenceId?: string,
        position: 'above' | 'below' = 'below',
    ): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        try {
            const next = insertPanelRow(current, referenceId, position);

            if (!changeLayout(next, true, true)) {
                return false;
            }

            const added = next.rails.find(
                (row) =>
                    !current.rails.some(
                        (previous) => previous.portable_id === row.portable_id,
                    ),
            );

            if (added) {
                selectRow(added.portable_id);
            }

            return true;
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));

            return false;
        }
    }

    function removeRow(rowId: string): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        try {
            const next = removePanelRow(current, rowId);

            if (!changeLayout(next, true, true)) {
                return false;
            }

            setActiveRowId(next.rails[0]?.portable_id ?? null);
            setSelection(null);
            setSelectedObjects([]);

            return true;
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));

            return false;
        }
    }

    function moveRow(rowId: string, direction: -1 | 1): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        try {
            return changeLayout(
                movePanelRow(current, rowId, direction),
                true,
                true,
            );
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));

            return false;
        }
    }

    function moveComponent(
        componentId: string,
        rowId: string,
        xMm?: number,
    ): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        try {
            if (
                !changeLayout(
                    movePanelDevice(current, componentId, rowId, xMm),
                    true,
                    true,
                )
            ) {
                return false;
            }

            setActiveRowId(rowId);
            setSelection({ type: 'component', id: componentId });
            setSelectedObjects([]);

            return true;
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));

            return false;
        }
    }

    function reorderComponent(componentId: string, direction: -1 | 1): boolean {
        const current = layoutRef.current;

        if (!current) {
            return false;
        }

        try {
            return changeLayout(
                reorderPanelDevice(current, componentId, direction),
                true,
                true,
            );
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));

            return false;
        }
    }

    async function exportJson(): Promise<void> {
        const current = layoutRef.current;

        if (!current || exporting) {
            return;
        }

        setExporting(true);
        setOperationError(null);

        try {
            const {
                design,
                components,
                rails,
                ducts,
                connections,
                cable_entries,
                cable_bundles,
                external_cables,
            } = layoutSnapshot(current);
            await downloadLightingJson(
                exportMethod.url(designId),
                structuredClone({
                    design,
                    components,
                    rails,
                    ducts,
                    connections,
                    cable_entries,
                    cable_bundles,
                    external_cables,
                }),
            );
        } catch (caught) {
            setOperationError(lightingErrorMessage(caught));
        } finally {
            setExporting(false);
        }
    }

    function addRail() {
        addRow();
    }

    function addDuct(orientation: DesignDuct['orientation']) {
        const current = layoutRef.current;
        const template = definitions.find(
            (definition) => definition.kind === 'duct',
        );

        if (!current || !template) {
            return;
        }

        const result = placeDefinition(current, template, {
            x_mm: current.design.margin_left_mm + 20,
            y_mm: current.design.margin_top_mm + 20,
        });
        const next = {
            ...result.layout,
            ducts: result.layout.ducts.map((duct) =>
                duct.portable_id === result.selection?.id
                    ? { ...duct, orientation }
                    : duct,
            ),
        };
        changeLayout(next, true, true);
        setSelection(result.selection);
        setSelectedObjects(result.selection ? [result.selection] : []);
    }

    function dropDefinition(id: number) {
        const definition = layoutRef.current?.definitions.find(
            (candidate) => candidate.id === id,
        );

        if (definition) {
            addDefinition(definition);
        }
    }

    function retrySave() {
        void queueRef.current?.flush().catch(() => undefined);
    }

    function reloadSaved() {
        bypassNavigation.current = true;
        window.location.reload();
    }

    function stayInEditor() {
        pendingNavigation.current = null;
        setLeaveDialog(false);
    }

    function discardAndLeave() {
        bypassNavigation.current = true;
        queueRef.current?.dispose();
        const action = pendingNavigation.current;
        pendingNavigation.current = null;
        setLeaveDialog(false);
        action?.();
    }

    return {
        layout,
        definitions,
        selection,
        setSelection: selectObject,
        selectedRowId:
            (selection?.type === 'component'
                ? layout?.components.find(
                      (item) => item.portable_id === selection.id,
                  )?.rail_portable_id
                : selection?.type === 'rail'
                  ? selection.id
                  : null) ??
            (layout?.rails.some((row) => row.portable_id === activeRowId)
                ? activeRowId
                : (layout?.rails[0]?.portable_id ?? null)),
        selectRow,
        operationError,
        clearOperationError: () => setOperationError(null),
        setSelectedObjects,
        persistence,
        loadError,
        error:
            [
                operationError,
                persistence.error
                    ? lightingErrorMessage(persistence.error)
                    : null,
                recoveryCleanupError,
            ]
                .filter(Boolean)
                .join(' ') || null,
        conflict:
            persistence.error instanceof LightingApiError &&
            persistence.error.status === 409,
        busy,
        leaveDialog,
        setLeaveDialog,
        canvasApi,
        onInitApi,
        zoom,
        setZoom,
        showGrid,
        setShowGrid,
        showWires,
        setShowWires,
        showLabels,
        setShowLabels,
        showExternalCabling,
        setShowExternalCabling,
        showCableLabels,
        setShowCableLabels,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        undo,
        redo,
        changeLayout,
        addDefinition,
        addRow,
        removeRow,
        moveRow,
        moveComponent,
        exportJson,
        exporting,
        reorderComponent,
        addRail,
        addDuct,
        dropDefinition,
        updateDesign,
        updateComponent,
        updateRail,
        updateDuct,
        updateConnection,
        addCableEntry,
        updateCableEntry,
        addCableBundle,
        updateCableBundle,
        addExternalCable,
        updateExternalCable,
        duplicateSelection,
        deleteSelection,
        retrySave,
        reloadSaved,
        stayInEditor,
        discardAndLeave,
        saveAsNewDesign,
        goHome: () => void attemptNavigation(() => router.visit(home())),
        openCatalog: () =>
            void attemptNavigation(() => router.visit(catalog())),
    };
}

export type LightingEditorController = ReturnType<typeof useLightingEditor>;
