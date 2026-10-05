import { Cable, Layers3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cableClassStyle } from './cabling-style';
import type { LightingLayout, LightingSelection } from './types';
import type { LightingEditorController } from './use-lighting-editor';

export function CablingDialog({
    open,
    onOpenChange,
    layout,
    editor,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    layout: LightingLayout;
    editor: LightingEditorController;
}) {
    function select(selection: LightingSelection) {
        editor.setSelection(selection);
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="lighting-editor-overlay dark max-h-[85svh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>External cabling</DialogTitle>
                    <DialogDescription>
                        Plan enclosure entries, shared bundles, and field
                        cables. Unassigned cables stay here until their
                        terminals are chosen.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-400">
                        {layout.cable_entries.length} entries ·{' '}
                        {layout.cable_bundles.length} bundles ·{' '}
                        {layout.external_cables.length} cables
                    </p>
                    <Button
                        size="sm"
                        onClick={() => {
                            editor.addCableEntry();
                            onOpenChange(false);
                        }}
                    >
                        <Plus /> Add cable entry
                    </Button>
                </div>
                {layout.cable_entries.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/15 p-7 text-center">
                        <Cable className="mx-auto mb-3 size-6 text-slate-500" />
                        <p className="text-sm text-slate-300">
                            Start with an opening on the enclosure.
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                            Create a shared bundle or a standalone cable at that
                            entry.
                        </p>
                    </div>
                )}
                <div className="grid gap-4">
                    {layout.cable_entries.map((entry) => (
                        <section
                            key={entry.portable_id}
                            className="rounded-xl border border-white/10 bg-black/10 p-3"
                        >
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-white/5"
                                data-testid={`lighting-cabling-item-${entry.portable_id}`}
                                onClick={() =>
                                    select({
                                        type: 'cable_entry',
                                        id: entry.portable_id,
                                    })
                                }
                            >
                                <span className="text-sm font-semibold">
                                    {entry.label}
                                </span>
                                <span className="text-xs text-slate-500 capitalize">
                                    {entry.side} ·{' '}
                                    {entry.entry_type.replaceAll('_', ' ')}
                                </span>
                            </button>
                            <div className="mt-2 grid gap-2">
                                {layout.cable_bundles
                                    .filter(
                                        (bundle) =>
                                            bundle.cable_entry_portable_id ===
                                            entry.portable_id,
                                    )
                                    .map((bundle) => {
                                        const style = cableClassStyle(
                                            bundle.cable_class,
                                        );
                                        const cables =
                                            layout.external_cables.filter(
                                                (cable) =>
                                                    cable.bundle_portable_id ===
                                                    bundle.portable_id,
                                            );

                                        return (
                                            <div
                                                key={bundle.portable_id}
                                                className="rounded-lg border border-white/10"
                                            >
                                                <button
                                                    type="button"
                                                    className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-white/5"
                                                    data-testid={`lighting-cabling-item-${bundle.portable_id}`}
                                                    onClick={() =>
                                                        select({
                                                            type: 'cable_bundle',
                                                            id: bundle.portable_id,
                                                        })
                                                    }
                                                >
                                                    <style.icon
                                                        className="mt-0.5 size-4 shrink-0"
                                                        style={{
                                                            color:
                                                                bundle.display_color ??
                                                                style.color,
                                                        }}
                                                    />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block text-sm font-medium">
                                                            {bundle.name}
                                                        </span>
                                                        <span className="mt-1 block text-xs text-slate-500">
                                                            {style.label} ·{' '}
                                                            {bundle.direction}
                                                            {bundle.external_location
                                                                ? ` · ${bundle.external_location}`
                                                                : ''}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-right text-xs text-slate-400">
                                                        {cables.length} defined
                                                        {bundle.planned_count !==
                                                            null && (
                                                            <span className="mt-1 block text-slate-500">
                                                                {
                                                                    bundle.planned_count
                                                                }{' '}
                                                                planned
                                                            </span>
                                                        )}
                                                    </span>
                                                </button>
                                                {cables.length > 0 && (
                                                    <div className="grid gap-1 border-t border-white/[0.06] p-2 pl-9">
                                                        {cables.map((cable) => (
                                                            <button
                                                                key={
                                                                    cable.portable_id
                                                                }
                                                                type="button"
                                                                data-testid={`lighting-cabling-item-${cable.portable_id}`}
                                                                className="flex items-center justify-between gap-3 rounded p-2 text-left text-sm hover:bg-white/5"
                                                                onClick={() =>
                                                                    select({
                                                                        type: 'external_cable',
                                                                        id: cable.portable_id,
                                                                    })
                                                                }
                                                            >
                                                                <span>
                                                                    {
                                                                        cable.label
                                                                    }
                                                                </span>
                                                                <span className="shrink-0 text-xs text-slate-500">
                                                                    {cable.internal_component_portable_id
                                                                        ? 'Assigned'
                                                                        : 'Unassigned'}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                {layout.external_cables
                                    .filter(
                                        (cable) =>
                                            cable.cable_entry_portable_id ===
                                            entry.portable_id,
                                    )
                                    .map((cable) => (
                                        <button
                                            key={cable.portable_id}
                                            type="button"
                                            data-testid={`lighting-cabling-item-${cable.portable_id}`}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-left text-sm hover:bg-white/5"
                                            onClick={() =>
                                                select({
                                                    type: 'external_cable',
                                                    id: cable.portable_id,
                                                })
                                            }
                                        >
                                            <span className="flex items-center gap-2">
                                                <Layers3 className="size-4 text-slate-500" />
                                                {cable.label}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                Standalone ·{' '}
                                                {cable.internal_component_portable_id
                                                    ? 'Assigned'
                                                    : 'Unassigned'}
                                            </span>
                                        </button>
                                    ))}
                            </div>
                        </section>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
