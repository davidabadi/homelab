import { Package } from 'lucide-react';
import type {
    ComponentDefinition,
    DesignConnection,
    DesignDuct,
    DesignRail,
    PlacedComponent,
} from './types';

export type DesignBomProps = {
    components: PlacedComponent[];
    rails: DesignRail[];
    ducts: DesignDuct[];
    connections: DesignConnection[];
    definitions: ComponentDefinition[];
};

export function DesignBom({
    components,
    rails,
    ducts,
    connections,
    definitions,
}: DesignBomProps) {
    const counts = new Map<number, number>();

    for (const object of [...components, ...rails, ...ducts]) {
        if (object.component_definition_id !== null) {
            counts.set(
                object.component_definition_id,
                (counts.get(object.component_definition_id) ?? 0) + 1,
            );
        }
    }

    const rows = [...counts.entries()]
        .map(([id, count]) => ({
            definition: definitions.find((definition) => definition.id === id),
            count,
        }))
        .filter((row) => row.definition)
        .sort((a, b) =>
            (a.definition?.display_name ?? '').localeCompare(
                b.definition?.display_name ?? '',
            ),
        );

    return (
        <section
            className="grid gap-4 p-4"
            aria-labelledby="lighting-bom-heading"
        >
            <h2
                id="lighting-bom-heading"
                className="flex items-center gap-2 text-sm font-semibold"
            >
                <Package className="size-4 text-muted-foreground" /> Design
                summary
            </h2>
            <dl className="grid grid-cols-2 gap-2">
                {[
                    ['Components', components.length],
                    ['DIN rails', rails.length],
                    ['Wire ducts', ducts.length],
                    ['Connections', connections.length],
                ].map(([label, count]) => (
                    <div
                        key={String(label)}
                        className="rounded-lg border bg-muted/20 p-2.5"
                    >
                        <dt className="text-[10px] text-muted-foreground">
                            {label}
                        </dt>
                        <dd className="mt-1 font-mono text-lg font-semibold">
                            {count}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className="grid gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground">
                    Bill of materials
                </h3>
                {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        Place equipment to build your component list.
                    </p>
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {rows.map(
                            ({ definition, count }) =>
                                definition && (
                                    <li
                                        key={definition.id}
                                        className="flex items-start justify-between gap-3 p-2.5 text-xs"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-medium">
                                                {definition.display_name}
                                            </p>
                                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                                                {definition.manufacturer} ·{' '}
                                                {definition.model}
                                                {definition.sku
                                                    ? ` · ${definition.sku}`
                                                    : ''}{' '}
                                                · rev {definition.revision}
                                            </p>
                                        </div>
                                        <span className="shrink-0 font-mono font-semibold">
                                            ×{count}
                                        </span>
                                    </li>
                                ),
                        )}
                    </ul>
                )}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
                Equipment counts reference catalog revisions. Rail and duct
                lengths remain editable in the panel layout.
            </p>
        </section>
    );
}
