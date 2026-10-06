import { ArrowRight, Cable, ChevronRight, Layers, Link2 } from 'lucide-react';
import { useRef } from 'react';
import type { CSSProperties } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cableClassStyle } from './cabling-style';
import type { RouteDescription } from './connection-lookup';
import type { LightingSelection } from './types';

const routeCategories = {
    connection: 'Internal',
    external_cable: 'Field cable',
    cable_bundle: 'Bundle',
};

export function RoutePicker({
    routes,
    open,
    onOpenChange,
    onSelect,
    title = `${routes.length} routes at this location`,
    description = 'Choose a route to inspect its cable details.',
    position,
}: {
    routes: RouteDescription[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (selection: LightingSelection) => void;
    title?: string;
    description?: string;
    position?: { x: number; y: number };
}) {
    const returnFocus = useRef<HTMLElement | null>(null);
    let style: CSSProperties | undefined;

    if (position && typeof window !== 'undefined' && window.innerWidth >= 640) {
        const height = Math.min(window.innerHeight - 32, 420);

        style = {
            left: Math.max(
                16,
                Math.min(position.x + 12, window.innerWidth - 368),
            ),
            top: Math.max(
                16,
                Math.min(position.y + 12, window.innerHeight - height - 16),
            ),
            transform: 'none',
            translate: 'none',
            maxHeight: height,
        };
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex max-h-[min(70vh,26rem)] flex-col gap-3 overflow-hidden border-white/15 bg-[#252a33] p-4 text-slate-100 sm:max-w-[22rem]"
                overlayClassName="bg-black/20"
                style={style}
                onOpenAutoFocus={() => {
                    returnFocus.current =
                        document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                }}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    const target = returnFocus.current?.isConnected
                        ? returnFocus.current
                        : document.querySelector<HTMLElement>(
                              '[aria-label="Properties inspector"] button',
                          );
                    target?.focus();
                }}
            >
                <DialogHeader className="shrink-0 pr-6 text-left">
                    <DialogTitle className="text-sm leading-5">
                        {title}
                    </DialogTitle>
                    <DialogDescription className="text-xs leading-5 text-slate-400">
                        {description}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
                    {routes.map((route) => {
                        const cableClass = route.cableClass
                            ? cableClassStyle(route.cableClass)
                            : null;
                        const Icon =
                            route.selection.type === 'cable_bundle'
                                ? Layers
                                : Cable;
                        const Connector =
                            route.selection.type === 'connection'
                                ? ArrowRight
                                : Link2;

                        return (
                            <button
                                key={`${route.selection.type}:${route.selection.id}`}
                                type="button"
                                data-route-id={route.selection.id}
                                className="grid gap-1.5 rounded-md border border-white/10 bg-white/[0.025] p-3 text-left transition-colors hover:border-blue-400/50 hover:bg-blue-400/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                                onClick={() => {
                                    onOpenChange(false);
                                    onSelect(route.selection);
                                }}
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <Icon
                                        className="size-3.5 shrink-0 text-slate-400"
                                        style={{ color: cableClass?.color }}
                                    />
                                    <span className="min-w-0 flex-1 break-words">
                                        {route.label}
                                    </span>
                                    <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                                </span>
                                <span className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-slate-400">
                                    <span>
                                        {routeCategories[route.selection.type]}
                                    </span>
                                    <span>{route.type}</span>
                                    {route.gauge && <span>{route.gauge}</span>}
                                    {cableClass && (
                                        <span>{cableClass.label}</span>
                                    )}
                                </span>
                                <span className="grid gap-0.5 text-xs leading-5 text-slate-300">
                                    <span className="break-words">
                                        {route.endpoints.source}
                                    </span>
                                    <span className="flex items-start gap-1.5">
                                        <Connector className="mt-1 size-3 shrink-0 text-slate-500" />
                                        <span className="min-w-0 break-words">
                                            {route.endpoints.target}
                                        </span>
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
