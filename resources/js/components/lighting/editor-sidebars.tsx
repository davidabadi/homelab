import { Blocks, ListTree, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { ComponentPalette } from './component-palette';
import { DesignBom } from './design-bom';
import { PropertiesInspector } from './properties-inspector';
import type { LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';

type SidebarProps = {
    editor: LightingEditorController;
    layout: LightingLayout;
};

function Inspector({
    editor,
    layout,
    tab,
    onTabChange,
}: SidebarProps & {
    tab: 'properties' | 'bom';
    onTabChange: (tab: 'properties' | 'bom') => void;
}) {
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 border-b px-3 py-2">
                <Button
                    size="sm"
                    variant={tab === 'properties' ? 'secondary' : 'ghost'}
                    onClick={() => onTabChange('properties')}
                >
                    <SlidersHorizontal className="size-3.5" /> Properties
                </Button>
                <Button
                    size="sm"
                    variant={tab === 'bom' ? 'secondary' : 'ghost'}
                    onClick={() => onTabChange('bom')}
                >
                    <ListTree className="size-3.5" /> BOM
                </Button>
            </div>
            <div className="min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto">
                {tab === 'bom' ? (
                    <DesignBom
                        components={layout.components}
                        rails={layout.rails}
                        ducts={layout.ducts}
                        connections={layout.connections}
                        definitions={layout.definitions}
                    />
                ) : (
                    <PropertiesInspector
                        layout={layout}
                        selection={editor.selection}
                        onUpdateDesign={editor.updateDesign}
                        onUpdateComponent={editor.updateComponent}
                        onUpdateRail={editor.updateRail}
                        onUpdateDuct={editor.updateDuct}
                        onUpdateConnection={editor.updateConnection}
                        onDuplicateComponent={editor.duplicateSelection}
                        onDeleteSelection={editor.deleteSelection}
                        onDetachComponent={(id) =>
                            editor.updateComponent(id, {
                                rail_portable_id: null,
                            })
                        }
                    />
                )}
            </div>
        </div>
    );
}

export function EditorWorkspace({
    editor,
    layout,
    children,
}: SidebarProps & { children: ReactNode }) {
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [tab, setTab] = useState<'properties' | 'bom'>('properties');
    const palette = (
        <ComponentPalette
            definitions={editor.definitions}
            onPlace={editor.addDefinition}
            onAddRail={editor.addRail}
            onAddDuct={editor.addDuct}
        />
    );
    const inspector = (
        <Inspector
            editor={editor}
            layout={layout}
            tab={tab}
            onTabChange={setTab}
        />
    );

    return (
        <>
            <div className="flex shrink-0 justify-between border-b px-3 py-1.5 lg:hidden">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPaletteOpen(true)}
                >
                    <Blocks /> Components
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setInspectorOpen(true)}
                >
                    <SlidersHorizontal /> Properties / BOM
                </Button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_300px] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
                <aside
                    aria-label="Component palette"
                    className="hidden min-h-0 [scrollbar-width:thin] overflow-y-auto border-r lg:block"
                >
                    {palette}
                </aside>
                <main
                    aria-label="Panel editor canvas"
                    className="relative min-h-0 min-w-0"
                >
                    {children}
                </main>
                <aside
                    aria-label="Properties inspector"
                    className="hidden min-h-0 flex-col border-l lg:flex"
                >
                    {inspector}
                </aside>
            </div>
            <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
                <SheetContent
                    side="left"
                    className="flex w-80 flex-col gap-0 p-0"
                >
                    <SheetHeader className="border-b p-4">
                        <SheetTitle>Component palette</SheetTitle>
                        <SheetDescription>
                            Add equipment to the panel.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {palette}
                    </div>
                </SheetContent>
            </Sheet>
            <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
                <SheetContent
                    side="right"
                    className="flex w-80 flex-col gap-0 p-0"
                >
                    <SheetHeader className="border-b p-4">
                        <SheetTitle>Panel properties</SheetTitle>
                        <SheetDescription>
                            Physical dimensions, wiring, and component
                            quantities.
                        </SheetDescription>
                    </SheetHeader>
                    {inspector}
                </SheetContent>
            </Sheet>
        </>
    );
}
