import { Head } from '@inertiajs/react';
import { Cable, Layers3, LayoutPanelTop } from 'lucide-react';
import { useState } from 'react';
import { AddDeviceDrawer } from '@/components/lighting/add-device-drawer';
import { CablingDialog } from '@/components/lighting/cabling-dialog';
import { cableClasses } from '@/components/lighting/cabling-style';
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
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import '../../../css/lighting-editor.css';

export default function LightingEditor({ designId }: { designId: number }) {
    const editor = useLightingEditor(designId);
    const { layout } = editor;
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [wiring, setWiring] = useState(false);
    const [cablingOpen, setCablingOpen] = useState(false);

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
                onAddCableEntry={() => editor.addCableEntry()}
                onCabling={() => setCablingOpen(true)}
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
                onExport={editor.exportJson}
                onExportWiring={editor.exportWiringPdf}
                exporting={editor.exporting}
            />
            <SaveConflictAlert editor={editor} />
            {wiring && (
                <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#20242c] px-6 py-3">
                    <div className="grid gap-1">
                        <p className="text-sm font-medium text-slate-200">
                            Wiring view
                        </p>
                        <p className="text-xs text-slate-400">
                            Shared trunks and field cables. Arrange devices in
                            the panel builder.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCablingOpen(true)}
                        >
                            <Cable /> Cabling
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <Layers3 /> Wiring layers
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="lighting-editor-overlay dark w-52"
                            >
                                <DropdownMenuCheckboxItem
                                    checked={editor.showWires}
                                    onCheckedChange={editor.setShowWires}
                                    onSelect={(event) => event.preventDefault()}
                                >
                                    Internal wiring
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={editor.showExternalCabling}
                                    onCheckedChange={
                                        editor.setShowExternalCabling
                                    }
                                    onSelect={(event) => event.preventDefault()}
                                >
                                    External cabling
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuCheckboxItem
                                    checked={editor.showCableLabels}
                                    onCheckedChange={(value) => {
                                        editor.setShowCableLabels(value);
                                    }}
                                    onSelect={(event) => event.preventDefault()}
                                >
                                    Cable labels
                                </DropdownMenuCheckboxItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setWiring(false)}
                        >
                            <LayoutPanelTop /> Panel builder
                        </Button>
                    </div>
                </div>
            )}
            {wiring && layout.cable_bundles.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/5 bg-[#1c2027] px-6 py-2 text-xs text-slate-400">
                    {Object.entries(cableClasses)
                        .filter(
                            ([key]) =>
                                layout.cable_bundles.some(
                                    (bundle) => bundle.cable_class === key,
                                ) ||
                                layout.external_cables.some(
                                    (cable) => cable.cable_class === key,
                                ),
                        )
                        .map(([key, style]) => (
                            <span key={key} className="flex items-center gap-2">
                                <style.icon
                                    className="size-3.5"
                                    style={{ color: style.color }}
                                />
                                {style.label}
                                <svg width="22" height="6" aria-hidden="true">
                                    <line
                                        x1="0"
                                        x2="22"
                                        y1="3"
                                        y2="3"
                                        stroke={style.color}
                                        strokeWidth="2"
                                        strokeDasharray={style.dash}
                                    />
                                </svg>
                            </span>
                        ))}
                    <span className="ml-auto text-slate-500">
                        Thick trunk · thin branch
                    </span>
                </div>
            )}
            <EditorWorkspace editor={editor} layout={layout} wiring={wiring}>
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
                        showWires={editor.showWires}
                        showExternalCabling={editor.showExternalCabling}
                        showCableLabels={editor.showCableLabels}
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
            <CablingDialog
                open={cablingOpen}
                onOpenChange={setCablingOpen}
                layout={layout}
                editor={editor}
            />
            <UnsavedChangesDialog editor={editor} />
        </div>
    );
}
