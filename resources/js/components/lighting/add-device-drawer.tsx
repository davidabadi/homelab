import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { ComponentImage } from './component-image';
import type { LightingLayout } from './types';
import type { LightingEditorController } from './use-lighting-editor';

function categoryLabel(category: string): string {
    return category
        .replaceAll('-', ' ')
        .replace(/^din\b/i, 'DIN')
        .replace(/^[a-z]/, (initial) => initial.toUpperCase());
}

export function AddDeviceDrawer({
    open,
    onOpenChange,
    editor,
    layout,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editor: LightingEditorController;
    layout: LightingLayout;
}) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const rows = [...layout.rails].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0),
    );
    const definitions = editor.definitions.filter(
        (definition) =>
            definition.kind === 'component' &&
            definition.mounting_type === 'din-rail' &&
            !definition.archived_at &&
            !editor.definitions.some(
                (other) =>
                    other.catalog_family_id === definition.catalog_family_id &&
                    other.revision > definition.revision,
            ),
    );
    const categories = [
        ...new Set(definitions.map((definition) => definition.category)),
    ].sort();
    const visible = definitions.filter(
        (definition) =>
            (category === 'all' || definition.category === category) &&
            `${definition.display_name} ${definition.manufacturer} ${definition.model} ${definition.category}`
                .toLowerCase()
                .includes(search.toLowerCase()),
    );
    const selectedRow =
        rows.find((row) => row.portable_id === editor.selectedRowId) ?? rows[0];
    const usedWidth = layout.components
        .filter(
            (component) =>
                component.rail_portable_id === selectedRow?.portable_id,
        )
        .reduce(
            (width, component) =>
                width +
                (layout.definitions.find(
                    (definition) =>
                        definition.id === component.component_definition_id,
                )?.width_mm ?? 0),
            0,
        );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                aria-label="Add device"
                className="lighting-editor-overlay dark flex w-full flex-col gap-0 border-white/10 bg-[#1c2027] p-0 text-slate-100 sm:max-w-[460px]"
            >
                <SheetHeader className="gap-2 border-b border-white/10 px-6 py-6">
                    <SheetTitle className="text-xl">Add device</SheetTitle>
                    <SheetDescription className="text-sm text-slate-400">
                        Choose equipment for your lighting panel.
                    </SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 border-b border-white/10 bg-black/10 px-6 py-5">
                    <label className="grid gap-2 text-sm font-medium text-slate-300">
                        Add to row
                        <select
                            className="h-10 rounded-md border border-white/15 bg-[#242932] px-3 text-sm text-slate-100 outline-none focus:border-blue-400"
                            value={selectedRow?.portable_id ?? ''}
                            onChange={(event) =>
                                editor.selectRow(event.target.value)
                            }
                        >
                            {rows.map((row, index) => (
                                <option
                                    key={row.portable_id}
                                    value={row.portable_id}
                                >
                                    Row {String(index + 1).padStart(2, '0')}
                                </option>
                            ))}
                        </select>
                    </label>
                    {selectedRow ? (
                        <p className="text-xs text-slate-500">
                            {Math.max(
                                0,
                                Math.round(selectedRow.length_mm - usedWidth),
                            )}{' '}
                            mm available. Devices are added at the end of the
                            row.
                        </p>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => editor.addRow()}
                        >
                            <Plus /> Add your first row
                        </Button>
                    )}
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-3 left-3 size-4 text-slate-500" />
                        <Input
                            autoFocus
                            aria-label="Search components"
                            placeholder="Search manufacturer or model…"
                            className="h-10 border-white/15 bg-[#242932] pl-10 text-sm"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <div
                        className="flex flex-wrap gap-1.5"
                        aria-label="Filter component category"
                    >
                        {['all', ...categories].map((item) => (
                            <button
                                key={item}
                                type="button"
                                aria-pressed={category === item}
                                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${category === item ? 'border-blue-400/40 bg-blue-500/15 text-blue-300' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
                                onClick={() => setCategory(item)}
                            >
                                {item === 'all'
                                    ? 'All devices'
                                    : categoryLabel(item)}
                            </button>
                        ))}
                    </div>
                    {editor.operationError && (
                        <p role="alert" className="text-sm text-amber-300">
                            {editor.operationError}
                        </p>
                    )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    <div className="grid gap-3">
                        {visible.map((definition) => (
                            <article
                                key={definition.id}
                                className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#252a33] p-3.5"
                            >
                                <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded-lg bg-[#e7e9ed] p-2">
                                    <ComponentImage definition={definition} />
                                </div>
                                <div className="grid min-w-0 flex-1 gap-1.5">
                                    <p className="text-sm leading-5 font-semibold text-slate-100">
                                        {definition.display_name}
                                    </p>
                                    <p className="text-xs leading-4 break-words text-slate-400">
                                        {definition.manufacturer} ·{' '}
                                        {definition.model}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {categoryLabel(definition.category)} ·{' '}
                                        {definition.width_mm} mm
                                        {definition.din_modules
                                            ? ` · ${definition.din_modules} modules`
                                            : ''}
                                    </p>
                                    <Button
                                        size="sm"
                                        className="mt-1 w-fit border border-blue-400/25 bg-blue-500/15 text-blue-200 shadow-none hover:bg-blue-500/25"
                                        aria-label={`Add ${definition.display_name}`}
                                        disabled={!selectedRow}
                                        onClick={() => {
                                            if (
                                                editor.addDefinition(
                                                    definition,
                                                    selectedRow?.portable_id,
                                                ) !== false
                                            ) {
                                                onOpenChange(false);
                                            }
                                        }}
                                    >
                                        <Plus className="size-3.5" /> Add to row
                                    </Button>
                                </div>
                            </article>
                        ))}
                        {visible.length === 0 && (
                            <div className="grid gap-2 rounded-xl border border-dashed border-white/15 px-5 py-10 text-center">
                                <p className="text-sm font-medium text-slate-300">
                                    No devices found
                                </p>
                                <p className="text-sm text-slate-500">
                                    Try another model or category.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="border-t border-white/10 px-6 py-4">
                    <Button
                        variant="ghost"
                        className="w-full text-slate-400"
                        onClick={editor.openCatalog}
                    >
                        Manage component catalog
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
