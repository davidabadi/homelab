import { useState } from 'react';
import { Input } from '@/components/ui/input';
export function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    nullable = false,
}: {
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
    min?: number;
    max?: number;
    nullable?: boolean;
}) {
    const [draft, setDraft] = useState('');
    const [focused, setFocused] = useState(false);

    return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <Input
                type="number"
                step="0.01"
                min={min}
                max={max}
                className="h-8 font-mono text-xs text-foreground"
                value={focused ? draft : value === null ? '' : String(value)}
                onFocus={() => {
                    setDraft(value === null ? '' : String(value));
                    setFocused(true);
                }}
                onChange={(event) => {
                    const next = event.target.value;
                    setDraft(next);

                    if (next === '') {
                        if (nullable) {
                            onChange(null);
                        }

                        return;
                    }

                    const numeric = Number(next);

                    if (
                        Number.isFinite(numeric) &&
                        (min === undefined || numeric >= min) &&
                        (max === undefined || numeric <= max)
                    ) {
                        onChange(numeric);
                    }
                }}
                onBlur={() => setFocused(false)}
            />
        </label>
    );
}

export function TextField({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    placeholder?: string;
}) {
    return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
            {label}
            <Input
                className="h-8 text-xs text-foreground"
                value={value ?? ''}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value || null)}
            />
        </label>
    );
}

export function NotesField({
    value,
    onChange,
}: {
    value: string | null;
    onChange: (value: string | null) => void;
}) {
    return (
        <label className="grid gap-1.5 text-xs text-muted-foreground">
            Notes
            <textarea
                rows={3}
                className="w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                value={value ?? ''}
                onChange={(event) => onChange(event.target.value || null)}
            />
        </label>
    );
}

export function ReadOnlyValue({
    label,
    value,
}: {
    label: string;
    value: string | number | null;
}) {
    return (
        <div className="flex justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right font-medium">{value ?? '—'}</span>
        </div>
    );
}
