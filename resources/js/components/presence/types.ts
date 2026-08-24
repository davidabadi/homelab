export type TripStatus = 'confirmed' | 'planned';

export type PresenceTrip = {
    id: number;
    entry_date: string;
    exit_date: string;
    status: TripStatus;
    notes: string | null;
    contribution_days: number;
    actual_days: number;
    phase: 'actual' | 'current' | 'scheduled' | 'planned';
};

export type PresenceTripInput = Pick<
    PresenceTrip,
    'entry_date' | 'exit_date' | 'status' | 'notes'
>;

export type PresenceSummary = {
    year: number;
    as_of: string;
    confirmed_days_elapsed: number;
    confirmed_scheduled_days: number;
    planned_days: number;
    projected_total: number;
    previous_year_total: number;
    two_years_prior_total: number;
    legacy_weighted_total: number;
    planning_limit: number | null;
    planning_basis: string;
    selected_calculated_total: number;
    remaining_against_planning_limit: number | null;
};

export type WeightedComponent = {
    year: number;
    days: number;
    divisor: number;
    weighted_days: number;
};

export type Planning = {
    default_planning_limit: number | null;
    yearly_overrides: { year: number; planning_limit: number }[];
};

export type CsvPreviewRow = {
    row: number;
    entry_date: string;
    exit_date: string;
    planned: boolean;
    status: TripStatus;
    notes: string | null;
    errors: string[];
    warnings: string[];
};

export type CsvPreview = {
    rows: CsvPreviewRow[];
    errors: string[];
    valid: boolean;
    total_rows: number;
    valid_rows: number;
    preview_hash: string;
};
