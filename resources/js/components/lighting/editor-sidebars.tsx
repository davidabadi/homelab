import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DesignBom } from './design-bom';
import { DeviceProperties } from './device-properties';
import { NumberField, NotesField } from './inspector-fields';
import type { LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';
import { WireProperties } from './wire-properties';

export function EditorWorkspace({
    editor,
    layout,
    children,
}: {
    editor: LightingEditorController;
    layout: LightingLayout;
    children: ReactNode;
}) {
    const rows = [...layout.rails].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const component =
        editor.selection?.type === 'component'
            ? layout.components.find(
                  (item) => item.portable_id === editor.selection?.id,
              )
            : null;
    const definition = component
        ? layout.definitions.find(
              (item) => item.id === component.component_definition_id,
          )
        : null;
    const row =
        editor.selection?.type === 'rail'
            ? rows.find((item) => item.portable_id === editor.selection?.id)
            : null;
    const rowIndex = rows.findIndex(
        (item) => item.portable_id === row?.portable_id,
    );
    const items = row
        ? layout.components.filter(
              (item) => item.rail_portable_id === row.portable_id,
          )
        : [];
    const connection =
        editor.selection?.type === 'connection'
            ? layout.connections.find(
                  (item) => item.portable_id === editor.selection?.id,
              )
            : null;
    const inspectorVisible = Boolean(
        (component && definition) || row || connection,
    );

    return (
        <div className="flex min-h-0 flex-1">
            <main
                aria-label="Panel editor canvas"
                className="relative min-h-0 min-w-0 flex-1"
            >
                {children}
            </main>
            {inspectorVisible && (
                <aside
                    aria-label="Properties inspector"
                    className="flex w-[292px] shrink-0 flex-col border-l border-white/10 bg-[#1b1e24]"
                >
                    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                        <h2 className="text-sm font-semibold text-slate-200">
                            {component
                                ? 'Device details'
                                : row
                                  ? `Row ${String(rowIndex + 1).padStart(2, '0')}`
                                  : 'Connection'}
                        </h2>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-slate-500"
                            aria-label="Close inspector"
                            onClick={() => editor.setSelection(null)}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                    <div className="grid min-h-0 gap-5 overflow-y-auto p-5">
                        {component && definition && (
                            <>
                                <DeviceProperties
                                    component={component}
                                    definition={definition}
                                    layout={layout}
                                    onUpdate={editor.updateComponent}
                                    onDuplicate={editor.duplicateSelection}
                                    onMove={editor.moveComponent}
                                    onReorder={editor.reorderComponent}
                                />
                                <Button
                                    variant="ghost"
                                    className="justify-start text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                    onClick={editor.deleteSelection}
                                >
                                    <Trash2 /> Delete device
                                </Button>
                            </>
                        )}
                        {row && (
                            <>
                                <div className="grid gap-2">
                                    <p className="text-base font-semibold text-slate-100">
                                        {items.length === 0
                                            ? 'Room for your next device'
                                            : `${items.length} ${items.length === 1 ? 'device' : 'devices'} in this row`}
                                    </p>
                                    <p className="text-sm leading-6 text-slate-400">
                                        Devices stay aligned on the DIN rail.
                                        Add a row whenever you need more room.
                                    </p>
                                </div>
                                <Button
                                    className="bg-blue-500 text-white hover:bg-blue-400"
                                    onClick={() =>
                                        editor.addRow(row.portable_id, 'above')
                                    }
                                >
                                    <Plus /> Add row above
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        editor.addRow(row.portable_id, 'below')
                                    }
                                >
                                    <Plus /> Add row below
                                </Button>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={rowIndex === 0}
                                        onClick={() =>
                                            editor.moveRow(row.portable_id, -1)
                                        }
                                    >
                                        <ArrowUp /> Up
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={rowIndex === rows.length - 1}
                                        onClick={() =>
                                            editor.moveRow(row.portable_id, 1)
                                        }
                                    >
                                        <ArrowDown /> Down
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    disabled={items.length > 0}
                                    className="justify-start text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                    onClick={() =>
                                        editor.removeRow(row.portable_id)
                                    }
                                >
                                    <Trash2 /> Remove empty row
                                </Button>
                                {items.length > 0 && (
                                    <p className="text-xs leading-5 text-slate-500">
                                        Move or remove devices before deleting
                                        this row.
                                    </p>
                                )}
                            </>
                        )}
                        {connection && (
                            <>
                                <WireProperties
                                    connection={connection}
                                    layout={layout}
                                    onUpdate={editor.updateConnection}
                                />
                                <Button
                                    variant="ghost"
                                    className="justify-start text-red-300"
                                    onClick={editor.deleteSelection}
                                >
                                    <Trash2 /> Delete connection
                                </Button>
                            </>
                        )}
                    </div>
                </aside>
            )}
        </div>
    );
}

export function PanelSettingsDialog({
    open,
    onOpenChange,
    summary,
    editor,
    layout,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    summary: boolean;
    editor: LightingEditorController;
    layout: LightingLayout;
}) {
    const availableWidth =
        layout.design.width_mm -
        layout.design.margin_left_mm -
        layout.design.margin_right_mm;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="lighting-editor-overlay dark max-h-[85svh] overflow-y-auto border-white/15 bg-[#1c2027] text-slate-100 sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>
                        {summary ? 'Design summary' : 'Panel settings'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {summary
                            ? 'Equipment and preserved wiring in this design.'
                            : 'Choose your row capacity. Panel height grows automatically.'}
                    </DialogDescription>
                </DialogHeader>
                {summary ? (
                    <DesignBom
                        components={layout.components}
                        rails={layout.rails}
                        ducts={layout.ducts}
                        connections={layout.connections}
                        definitions={layout.definitions}
                    />
                ) : (
                    <div className="grid gap-5">
                        <div className="grid gap-3">
                            <p className="text-sm font-medium">Row capacity</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[18, 24, 36].map((modules) => (
                                    <Button
                                        key={modules}
                                        variant="outline"
                                        aria-pressed={
                                            Math.abs(
                                                availableWidth - modules * 18,
                                            ) < 1
                                        }
                                        className={
                                            Math.abs(
                                                availableWidth - modules * 18,
                                            ) < 1
                                                ? 'border-blue-400/50 bg-blue-500/10 text-blue-200'
                                                : 'border-white/15 bg-transparent'
                                        }
                                        onClick={() =>
                                            editor.updateDesign({
                                                width_mm:
                                                    modules * 18 +
                                                    layout.design
                                                        .margin_left_mm +
                                                    layout.design
                                                        .margin_right_mm,
                                            })
                                        }
                                    >
                                        {modules} modules
                                    </Button>
                                ))}
                            </div>
                            <p className="text-xs leading-5 text-slate-500">
                                Physical dimensions stay with your catalog
                                devices. Cards keep a readable size in the
                                builder.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-black/10 p-4">
                            <div>
                                <p className="text-xs text-slate-500">
                                    Enclosure width
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                    {layout.design.width_mm} mm
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">
                                    Automatic height
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                    {layout.design.height_mm} mm
                                </p>
                            </div>
                        </div>
                        <details className="rounded-lg border border-white/10 p-4">
                            <summary className="cursor-pointer text-sm font-medium">
                                Advanced dimensions
                            </summary>
                            <div className="mt-4 grid gap-4">
                                <NumberField
                                    label="Enclosure width (mm)"
                                    value={layout.design.width_mm}
                                    min={1}
                                    max={10000}
                                    onChange={(value) =>
                                        value !== null &&
                                        editor.updateDesign({ width_mm: value })
                                    }
                                />
                                <NumberField
                                    label="Enclosure depth (mm, optional)"
                                    value={layout.design.depth_mm}
                                    nullable
                                    min={1}
                                    onChange={(depth_mm) =>
                                        editor.updateDesign({ depth_mm })
                                    }
                                />
                            </div>
                        </details>
                        <NotesField
                            value={layout.design.notes}
                            onChange={(notes) => editor.updateDesign({ notes })}
                        />
                        {layout.ducts.length > 0 && (
                            <p className="text-sm leading-5 text-slate-400">
                                {layout.ducts.length} existing wire{' '}
                                {layout.ducts.length === 1
                                    ? 'duct is'
                                    : 'ducts are'}{' '}
                                preserved in this design and available in the
                                wiring view.
                            </p>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
