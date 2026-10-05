import { Head } from '@inertiajs/react';
import { LayoutPanelTop } from 'lucide-react';
import { useState } from 'react';
import { AddDeviceDrawer } from '@/components/lighting/add-device-drawer';
import {
    EditorWorkspace,
    PanelSettingsDialog,
} from '@/components/lighting/editor-sidebars';
import { EditorToolbar } from '@/components/lighting/editor-toolbar';
import { PanelBuilder } from '@/components/lighting/panel-builder';
import { PanelCanvas } from '@/components/lighting/panel-canvas';
import {
    SaveConflictAlert,
    UnsavedChangesDialog,
} from '@/components/lighting/unsaved-changes-dialog';
import { useLightingEditor } from '@/components/lighting/use-lighting-editor';
import { Button } from '@/components/ui/button';
import '../../../css/lighting-editor.css';

export default function LightingEditor({ designId }: { designId: number }) {
    const editor = useLightingEditor(designId);
    const { layout } = editor;
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [wiring, setWiring] = useState(false);

    function openAddDevice(rowId?: string) {
        if (rowId) {
            editor.selectRow(rowId);
        }

        setCatalogOpen(true);
    }

    if (!layout) {
        return (
            <div className="lighting-editor dark flex min-h-svh items-center justify-center bg-[#171a20] p-6 text-slate-200">
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
        <div className="lighting-editor dark flex h-svh min-h-0 flex-col overflow-hidden bg-[#171a20] text-slate-200">
            <Head title={layout.design.name} />
            <EditorToolbar
                name={layout.design.name}
                status={editor.persistence.status}
                error={editor.error}
                canUndo={editor.canUndo}
                canRedo={editor.canRedo}
                wiring={wiring}
                onBack={editor.goHome}
                onNameChange={(name) => editor.updateDesign({ name })}
                onAddDevice={() => openAddDevice()}
                onAddRow={() => editor.addRow()}
                onUndo={editor.undo}
                onRedo={editor.redo}
                onSettings={() => {
                    setShowSummary(false);
                    setSettingsOpen(true);
                }}
                onSummary={() => {
                    setShowSummary(true);
                    setSettingsOpen(true);
                }}
                onWiring={() => setWiring((value) => !value)}
                onRetry={editor.retrySave}
                onCatalog={editor.openCatalog}
            />
            <SaveConflictAlert editor={editor} />
            {wiring && (
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#20242c] px-6 py-3">
                    <div className="grid gap-1">
                        <p className="text-sm font-medium text-slate-200">
                            Wiring view
                        </p>
                        <p className="text-xs text-slate-400">
                            Existing connections and terminal relationships.
                            Arrange devices in the panel builder.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWiring(false)}
                    >
                        <LayoutPanelTop /> Panel builder
                    </Button>
                </div>
            )}
            <EditorWorkspace editor={editor} layout={layout}>
                {wiring ? (
                    <PanelCanvas
                        layout={layout}
                        selection={editor.selection}
                        onSelectionChange={editor.setSelection}
                        onSelectedObjectsChange={editor.setSelectedObjects}
                        onChange={(next, commit = true) =>
                            editor.changeLayout(next, commit, commit)
                        }
                        showGrid={false}
                        showWires
                        showLabels
                        onDropDefinition={() => undefined}
                        onInitApi={editor.onInitApi}
                        onZoomChange={editor.setZoom}
                    />
                ) : (
                    <PanelBuilder
                        editor={editor}
                        layout={layout}
                        onAddDevice={openAddDevice}
                    />
                )}
            </EditorWorkspace>
            <AddDeviceDrawer
                open={catalogOpen}
                onOpenChange={setCatalogOpen}
                editor={editor}
                layout={layout}
            />
            <PanelSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                summary={showSummary}
                editor={editor}
                layout={layout}
            />
            <UnsavedChangesDialog editor={editor} />
        </div>
    );
}
