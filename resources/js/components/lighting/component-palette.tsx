import { Cable, Minus, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ComponentImage } from './component-image';
import type { ComponentDefinition } from './types';

export type ComponentPaletteProps = {
    definitions: ComponentDefinition[];
    onPlace: (definition: ComponentDefinition) => void;
    onAddRail: () => void;
    onAddDuct: (orientation: 'horizontal' | 'vertical') => void;
};

export function ComponentPalette({
    definitions,
    onPlace,
    onAddRail,
    onAddDuct,
}: ComponentPaletteProps) {
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const latestDefinitions = definitions.filter(
        (definition) =>
            !definition.archived_at &&
            !definitions.some(
                (other) =>
                    other.catalog_family_id === definition.catalog_family_id &&
                    other.revision > definition.revision,
            ),
    );
    const categories = [
        ...new Set(latestDefinitions.map((definition) => definition.category)),
    ].sort();
    const visible = latestDefinitions.filter(
        (definition) =>
            (category === 'all' || definition.category === category) &&
            `${definition.manufacturer} ${definition.model} ${definition.display_name} ${definition.category}`
                .toLowerCase()
                .includes(search.toLowerCase()),
    );

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="grid shrink-0 gap-3 border-b p-4">
                <div>
                    <h2 className="text-sm font-semibold">Component library</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                        Drag into the enclosure, or click to place.
                    </p>
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Search components"
                        className="h-8 pl-8 text-xs"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Manufacturer, model…"
                    />
                </div>
                <label className="grid gap-1 text-xs text-muted-foreground">
                    Category
                    <select
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
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
                </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="grid gap-2">
                    {visible.map((definition) => (
                        <button
                            key={definition.id}
                            type="button"
                            draggable
                            className="group flex w-full gap-3 rounded-lg border bg-card p-2 text-left shadow-xs hover:border-amber-500/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={`Place ${definition.display_name}`}
                            onClick={() => onPlace(definition)}
                            onDragStart={(event) => {
                                event.dataTransfer.setData(
                                    'application/lighting-definition',
                                    String(definition.id),
                                );
                                event.dataTransfer.effectAllowed = 'copy';
                            }}
                        >
                            <div className="h-14 w-11 shrink-0 overflow-hidden rounded border bg-white">
                                <ComponentImage definition={definition} />
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="text-xs leading-snug font-semibold">
                                    {definition.display_name}
                                </span>
                                <span className="truncate text-[10px] text-muted-foreground">
                                    {definition.manufacturer} ·{' '}
                                    {definition.model}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                    {definition.width_mm} ×{' '}
                                    {definition.height_mm} mm
                                </span>
                                {(definition.metadata.sample_dimensions ===
                                    true ||
                                    definition.metadata.dimensions_status ===
                                        'sample') && (
                                    <Badge
                                        variant="outline"
                                        className="w-fit border-amber-500/40 text-[9px] text-amber-700 dark:text-amber-400"
                                    >
                                        Sample dimensions
                                    </Badge>
                                )}
                            </div>
                            <Plus className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-amber-600" />
                        </button>
                    ))}
                    {visible.length === 0 && (
                        <p className="p-4 text-center text-xs text-muted-foreground">
                            No components match your search.
                        </p>
                    )}
                </div>
            </div>
            <div className="grid shrink-0 gap-2 border-t bg-muted/20 p-3">
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    Panel hardware
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={onAddRail}
                >
                    <Minus /> Add DIN rail
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="px-2 text-xs"
                        onClick={() => onAddDuct('horizontal')}
                    >
                        <Cable /> H duct
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="px-2 text-xs"
                        onClick={() => onAddDuct('vertical')}
                    >
                        <Cable className="rotate-90" /> V duct
                    </Button>
                </div>
            </div>
        </div>
    );
}
