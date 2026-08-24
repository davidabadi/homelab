import { dayNames } from './types';
import type { DayFilterValue } from './types';

type Props = {
    value: DayFilterValue;
    onChange: (value: DayFilterValue) => void;
};

export function DayFilter({ value, onChange }: Props) {
    const options: { label: string; value: DayFilterValue }[] = [
        { label: 'All', value: 'all' },
        ...dayNames.map((label, index) => ({ label, value: index })),
    ];

    return (
        <div
            aria-label="Filter schedule by day"
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-700 bg-slate-950/70 p-1"
            role="group"
        >
            {options.map((option) => {
                const active = value === option.value;

                return (
                    <button
                        key={option.label}
                        aria-pressed={active}
                        className={`min-h-9 min-w-11 rounded-md px-3 text-xs font-bold tracking-wider uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                            active
                                ? 'bg-amber-400 text-slate-950'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                        }`}
                        type="button"
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
