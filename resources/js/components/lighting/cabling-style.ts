import { Cable, Network, Radio, Zap } from 'lucide-react';

export const cableClasses = {
    line_voltage: {
        label: 'Line voltage',
        short: 'AC',
        color: '#fb923c',
        dash: undefined,
        icon: Zap,
    },
    low_voltage_control: {
        label: 'Low voltage control',
        short: 'LV',
        color: '#5eead4',
        dash: '10 4',
        icon: Radio,
    },
    data: {
        label: 'Data',
        short: 'DATA',
        color: '#c4b5fd',
        dash: '2 5',
        icon: Network,
    },
    other: {
        label: 'Other',
        short: 'OTHER',
        color: '#94a3b8',
        dash: '6 4',
        icon: Cable,
    },
};

export function cableClassStyle(value: string | null) {
    return (
        cableClasses[value as keyof typeof cableClasses] ?? cableClasses.other
    );
}
