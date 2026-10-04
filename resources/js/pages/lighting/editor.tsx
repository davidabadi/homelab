import { Head } from '@inertiajs/react';
import { EditorWorkspace } from '@/components/lighting/editor-sidebars';
import { EditorToolbar } from '@/components/lighting/editor-toolbar';
import { PanelCanvas } from '@/components/lighting/panel-canvas';
import {
    SaveConflictAlert,
    UnsavedChangesDialog,
} from '@/components/lighting/unsaved-changes-dialog';
import { useLightingEditor } from '@/components/lighting/use-lighting-editor';
import { Button } from '@/components/ui/button';

export default function LightingEditor({ designId }: { designId: number }) {
    const editor = useLightingEditor(designId);
    const { layout } = editor;

    if (!layout) {
        return (
            <div className="flex min-h-svh items-center justify-center p-6">
                <Head title="Panel editor" />
                <div
                    role={editor.loadError ? 'alert' : 'status'}
                    className="text-center"
                >
                    <p>{editor.loadError ?? 'Loading panel design…'}</p>
                    {editor.loadError && (
                        <Button
                            className="mt-4"
                            onClick={() => window.location.reload()}
                        >
                            Retry
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background text-foreground">
            <Head title={layout.design.name} />
            <EditorToolbar
                name={layout.design.name}
                status={editor.persistence.status}
                error={editor.error}
                zoom={editor.zoom}
                showGrid={editor.showGrid}
                showWiring={editor.showWires}
                showLabels={editor.showLabels}
                snapToGrid={layout.design.snap_to_grid}
                canUndo={editor.canUndo}
                canRedo={editor.canRedo}
                onBack={editor.goHome}
                onNameChange={(name) => editor.updateDesign({ name })}
                onCatalog={editor.openCatalog}
                onZoomIn={() => editor.canvasApi?.zoomIn()}
                onZoomOut={() => editor.canvasApi?.zoomOut()}
                onFit={() => editor.canvasApi?.fit()}
                onToggleGrid={() => editor.setShowGrid((value) => !value)}
                onToggleWiring={() => editor.setShowWires((value) => !value)}
                onToggleLabels={() => editor.setShowLabels((value) => !value)}
                onToggleSnap={() =>
                    editor.updateDesign({
                        snap_to_grid: !layout.design.snap_to_grid,
                    })
                }
                onUndo={editor.undo}
                onRedo={editor.redo}
                onRetry={editor.retrySave}
            />
            <SaveConflictAlert editor={editor} />
            <EditorWorkspace editor={editor} layout={layout}>
                <PanelCanvas
                    layout={layout}
                    selection={editor.selection}
                    onSelectionChange={editor.setSelection}
                    onSelectedObjectsChange={editor.setSelectedObjects}
                    onChange={(next, commit = true) =>
                        editor.changeLayout(next, commit, commit)
                    }
                    showGrid={editor.showGrid}
                    showWires={editor.showWires}
                    showLabels={editor.showLabels}
                    onDropDefinition={editor.dropDefinition}
                    onInitApi={editor.onInitApi}
                    onZoomChange={editor.setZoom}
                />
            </EditorWorkspace>
            <UnsavedChangesDialog editor={editor} />
        </div>
    );
}
