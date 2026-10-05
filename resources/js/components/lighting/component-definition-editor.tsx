import { LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { CatalogSnapshot } from './interchange';
import type { ComponentDefinition, TerminalDefinition } from './types';

export const componentCategories = [
    'DIN dimmer',
    'DIN relay',
    'controller / ESP32',
    'I/O module',
    'power supply',
    'terminal block',
    'circuit protection',
    'network device',
    'relay / fallback relay',
    'DIN rail',
    'wire duct',
    'miscellaneous',
];

type DefinitionForm = {
    manufacturer: string;
    model: string;
    display_name: string;
    category: string;
    kind: ComponentDefinition['kind'];
    sku: string;
    width_mm: string;
    height_mm: string;
    depth_mm: string;
    din_modules: string;
    mounting_type: string;
    mounting_anchor_x_mm: string;
    mounting_anchor_y_mm: string;
    image_url: string;
    datasheet_url: string;
    description: string;
};

type TerminalForm = Omit<TerminalDefinition, 'x_mm' | 'y_mm' | 'purpose'> & {
    x_mm: string;
    y_mm: string;
    purpose: string;
    form_id: string;
};

export function ComponentDefinitionEditor({
    definition,
    seed,
    saving,
    error,
    onClose,
    onSave,
}: {
    definition: ComponentDefinition | null;
    seed?: CatalogSnapshot;
    saving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: (body: FormData) => Promise<void>;
}) {
    const initialDefinition = definition ?? seed;
    const [form, setForm] = useState<DefinitionForm>(() => ({
        manufacturer: initialDefinition?.manufacturer ?? '',
        model: initialDefinition?.model ?? '',
        display_name: initialDefinition?.display_name ?? '',
        category: initialDefinition?.category ?? 'miscellaneous',
        kind: initialDefinition?.kind ?? 'component',
        sku: initialDefinition?.sku ?? '',
        width_mm: initialDefinition ? String(initialDefinition.width_mm) : '',
        height_mm: initialDefinition ? String(initialDefinition.height_mm) : '',
        depth_mm:
            initialDefinition?.depth_mm == null
                ? ''
                : String(initialDefinition.depth_mm),
        din_modules:
            initialDefinition?.din_modules == null
                ? ''
                : String(initialDefinition.din_modules),
        mounting_type: initialDefinition?.mounting_type ?? 'din-rail',
        mounting_anchor_x_mm:
            initialDefinition?.mounting_anchor_x_mm == null
                ? ''
                : String(initialDefinition.mounting_anchor_x_mm),
        mounting_anchor_y_mm:
            initialDefinition?.mounting_anchor_y_mm == null
                ? ''
                : String(initialDefinition.mounting_anchor_y_mm),
        image_url: initialDefinition?.image_url ?? '',
        datasheet_url: initialDefinition?.datasheet_url ?? '',
        description: initialDefinition?.description ?? '',
    }));
    const [terminals, setTerminals] = useState<TerminalForm[]>(() =>
        (initialDefinition?.terminals ?? []).map((terminal) => ({
            ...terminal,
            x_mm: String(terminal.x_mm),
            y_mm: String(terminal.y_mm),
            purpose: terminal.purpose ?? '',
            form_id: crypto.randomUUID(),
        })),
    );
    const [metadata, setMetadata] = useState(
        JSON.stringify(initialDefinition?.metadata ?? {}, null, 2),
    );
    const [image, setImage] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    function updateForm(field: keyof DefinitionForm, value: string): void {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function updateTerminal(id: string, patch: Partial<TerminalForm>): void {
        setTerminals((current) =>
            current.map((terminal) =>
                terminal.form_id === id ? { ...terminal, ...patch } : terminal,
            ),
        );
    }

    async function submit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setLocalError(null);
        let parsedMetadata: unknown;

        try {
            parsedMetadata = JSON.parse(metadata);
        } catch {
            setLocalError('Metadata must contain valid JSON.');

            return;
        }

        if (
            !parsedMetadata ||
            typeof parsedMetadata !== 'object' ||
            Array.isArray(parsedMetadata)
        ) {
            setLocalError('Metadata must be a JSON object.');

            return;
        }

        const body = new FormData();

        for (const [key, value] of Object.entries(form)) {
            body.append(key, value);
        }

        body.append('metadata', JSON.stringify(parsedMetadata));
        body.append(
            'terminals',
            JSON.stringify(
                terminals.map((terminal) => ({
                    key: terminal.key.trim(),
                    label: terminal.label.trim(),
                    side: terminal.side,
                    x_mm: Number(terminal.x_mm),
                    y_mm: Number(terminal.y_mm),
                    purpose: terminal.purpose.trim() || null,
                    metadata: terminal.metadata ?? {},
                })),
            ),
        );

        if (image) {
            body.append('image', image);
        }

        if (removeImage) {
            body.append('remove_image', '1');
        }

        await onSave(body);
    }

    function field(
        label: string,
        name: keyof DefinitionForm,
        options: {
            required?: boolean;
            type?: string;
            placeholder?: string;
            min?: number;
            list?: string;
        } = {},
    ) {
        return (
            <label className="grid gap-1.5 text-xs font-medium">
                {label}
                <Input
                    value={form[name]}
                    required={options.required}
                    type={options.type ?? 'text'}
                    min={options.min}
                    step={options.type === 'number' ? 'any' : undefined}
                    maxLength={options.type !== 'number' ? 255 : undefined}
                    placeholder={options.placeholder}
                    list={options.list}
                    onChange={(event) => updateForm(name, event.target.value)}
                />
            </label>
        );
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent className="max-h-[calc(100svh-2rem)] grid-cols-1 overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>
                        {definition
                            ? `New revision of ${definition.display_name}`
                            : seed
                              ? `Create ${seed.display_name}`
                              : 'New component definition'}
                    </DialogTitle>
                    <DialogDescription>
                        {definition
                            ? 'Create a new catalog revision. Existing panel placements keep their original physical dimensions and terminal layout.'
                            : seed
                              ? 'Review the exported product details before adding this component to your catalog. All dimensions are in millimeters.'
                              : 'Enter verified product dimensions, or clearly mark sample dimensions in metadata. All dimensions are in millimeters.'}
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid grid-cols-1 gap-6"
                    onSubmit={(event) => void submit(event)}
                >
                    {seed?.has_local_image && (
                        <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                            This component had a local product image in the
                            original catalog. Upload a replacement below if
                            desired.
                        </p>
                    )}
                    <fieldset className="grid gap-3">
                        <legend className="mb-3 text-sm font-semibold">
                            Product details
                        </legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {field('Display name', 'display_name', {
                                required: true,
                            })}
                            {field('Manufacturer', 'manufacturer', {
                                required: true,
                            })}
                            {field('Model', 'model', { required: true })}
                            {field('Part number / SKU', 'sku')}
                            {field('Category', 'category', {
                                required: true,
                                list: 'lighting-categories',
                            })}
                            <label className="grid gap-1.5 text-xs font-medium">
                                Physical object type
                                <select
                                    className="h-9 rounded-md border bg-background px-3 text-sm"
                                    value={form.kind}
                                    onChange={(event) =>
                                        updateForm('kind', event.target.value)
                                    }
                                >
                                    <option value="component">Device</option>
                                    <option value="rail">DIN rail</option>
                                    <option value="duct">Wire duct</option>
                                </select>
                            </label>
                        </div>
                        <datalist id="lighting-categories">
                            {componentCategories.map((category) => (
                                <option key={category} value={category} />
                            ))}
                        </datalist>
                    </fieldset>
                    <fieldset className="grid gap-3">
                        <legend className="mb-3 text-sm font-semibold">
                            Dimensions and mounting
                        </legend>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {field('Width (mm)', 'width_mm', {
                                required: true,
                                type: 'number',
                                min: 0.1,
                            })}
                            {field('Height (mm)', 'height_mm', {
                                required: true,
                                type: 'number',
                                min: 0.1,
                            })}
                            {field('Depth (mm, optional)', 'depth_mm', {
                                type: 'number',
                                min: 0.1,
                            })}
                            {field('DIN module count', 'din_modules', {
                                type: 'number',
                                min: 0,
                            })}
                            {field('Mounting type', 'mounting_type', {
                                required: true,
                                list: 'lighting-mounting-types',
                            })}
                        </div>
                        <datalist id="lighting-mounting-types">
                            <option value="din-rail" />
                            <option value="panel" />
                            <option value="pcb" />
                            <option value="free" />
                        </datalist>
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">
                                Optional DIN mounting anchor, measured from the
                                device’s upper-left corner. This point aligns
                                with the rail centerline.
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                {field(
                                    'Mounting anchor X (mm)',
                                    'mounting_anchor_x_mm',
                                    { type: 'number', min: 0 },
                                )}
                                {field(
                                    'Mounting anchor Y (mm)',
                                    'mounting_anchor_y_mm',
                                    { type: 'number', min: 0 },
                                )}
                            </div>
                        </div>
                    </fieldset>
                    <fieldset className="grid gap-3">
                        <legend className="mb-3 text-sm font-semibold">
                            Images and reference
                        </legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {field('Manufacturer image URL', 'image_url', {
                                type: 'url',
                                placeholder: 'https://…',
                            })}
                            {field('Datasheet URL', 'datasheet_url', {
                                type: 'url',
                                placeholder: 'https://…',
                            })}
                            <label className="grid gap-1.5 text-xs font-medium sm:col-span-2">
                                Local product image
                                <Input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(event) =>
                                        setImage(
                                            event.target.files?.[0] ?? null,
                                        )
                                    }
                                />
                                <span className="text-[10px] font-normal text-muted-foreground">
                                    PNG, JPEG, or WebP. Local images take
                                    priority over image URLs.
                                    {definition?.image_path
                                        ? ' Leave empty to keep the current local image.'
                                        : ''}
                                </span>
                            </label>
                        </div>
                        <label className="grid gap-1.5 text-xs font-medium">
                            Description / product notes
                            <textarea
                                rows={3}
                                className="resize-y rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={form.description}
                                onChange={(event) =>
                                    updateForm(
                                        'description',
                                        event.target.value,
                                    )
                                }
                            />
                        </label>
                    </fieldset>
                    {definition?.image_path && (
                        <label className="flex items-center gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={removeImage}
                                onChange={(event) =>
                                    setRemoveImage(event.target.checked)
                                }
                            />{' '}
                            Remove current local image in this revision
                        </label>
                    )}
                    <fieldset className="grid gap-3">
                        <legend className="mb-3 text-sm font-semibold">
                            Terminals
                        </legend>
                        <p className="text-xs text-muted-foreground">
                            Each terminal needs a unique key. Its physical X/Y
                            position is measured from the device’s upper-left
                            corner.
                        </p>
                        <div className="grid gap-3">
                            {terminals.map((terminal, position) => (
                                <div
                                    key={terminal.form_id}
                                    className="grid gap-3 rounded-lg border bg-muted/20 p-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold">
                                            Terminal {position + 1}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-muted-foreground hover:text-destructive"
                                            aria-label={`Remove terminal ${position + 1}`}
                                            onClick={() =>
                                                setTerminals((current) =>
                                                    current.filter(
                                                        (item) =>
                                                            item.form_id !==
                                                            terminal.form_id,
                                                    ),
                                                )
                                            }
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        <label className="grid gap-1 text-xs">
                                            Key
                                            <Input
                                                required
                                                value={terminal.key}
                                                placeholder="L"
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            key: event.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-1 text-xs">
                                            Label
                                            <Input
                                                required
                                                value={terminal.label}
                                                placeholder="L"
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            label: event.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-1 text-xs">
                                            Side
                                            <select
                                                className="h-9 rounded-md border bg-background px-2 text-sm"
                                                value={terminal.side}
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            side: event.target
                                                                .value as TerminalDefinition['side'],
                                                        },
                                                    )
                                                }
                                            >
                                                {(
                                                    [
                                                        'top',
                                                        'right',
                                                        'bottom',
                                                        'left',
                                                    ] as const
                                                ).map((side) => (
                                                    <option
                                                        key={side}
                                                        value={side}
                                                    >
                                                        {side}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="grid gap-1 text-xs">
                                            X (mm)
                                            <Input
                                                required
                                                type="number"
                                                min="0"
                                                max={form.width_mm || undefined}
                                                step="any"
                                                value={terminal.x_mm}
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            x_mm: event.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-1 text-xs">
                                            Y (mm)
                                            <Input
                                                required
                                                type="number"
                                                min="0"
                                                max={
                                                    form.height_mm || undefined
                                                }
                                                step="any"
                                                value={terminal.y_mm}
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            y_mm: event.target
                                                                .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="grid gap-1 text-xs">
                                            Purpose
                                            <Input
                                                value={terminal.purpose}
                                                placeholder="power, output, network…"
                                                onChange={(event) =>
                                                    updateTerminal(
                                                        terminal.form_id,
                                                        {
                                                            purpose:
                                                                event.target
                                                                    .value,
                                                        },
                                                    )
                                                }
                                            />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-fit"
                            size="sm"
                            onClick={() =>
                                setTerminals((current) => [
                                    ...current,
                                    {
                                        form_id: crypto.randomUUID(),
                                        key: '',
                                        label: '',
                                        side: 'top',
                                        x_mm: '0',
                                        y_mm: '0',
                                        purpose: '',
                                    },
                                ])
                            }
                        >
                            <Plus /> Add terminal
                        </Button>
                    </fieldset>
                    <details className="rounded-lg border p-3">
                        <summary className="cursor-pointer text-xs font-semibold">
                            Product metadata (JSON)
                        </summary>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Use {`{"dimensions_status":"sample"}`} for
                            provisional dimensions. Product-specific attributes
                            can be added here.
                        </p>
                        <label className="mt-3 grid gap-1.5 text-xs font-medium">
                            Metadata JSON
                            <textarea
                                rows={6}
                                spellCheck={false}
                                className="resize-y rounded-md border bg-muted/20 p-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                                value={metadata}
                                onChange={(event) =>
                                    setMetadata(event.target.value)
                                }
                            />
                        </label>
                    </details>
                    {(localError || error) && (
                        <p role="alert" className="text-sm text-destructive">
                            {localError || error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={saving}
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving && (
                                <LoaderCircle className="animate-spin" />
                            )}
                            {definition
                                ? 'Save new revision'
                                : 'Create component'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
