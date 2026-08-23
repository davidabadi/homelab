/**
 * Today's date as a local `YYYY-MM-DD` string, to compare against the ISO
 * air/release dates the backend sends (which are date-only, no timezone).
 */
export function localToday(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Whether an episode has actually aired (spec Part 2 §1): it has an air date and
 * it's today or earlier. Gates the right-swipe "mark watched" gesture — you
 * can't watch what hasn't aired. Lexicographic comparison is valid for
 * zero-padded ISO dates.
 */
export function hasAired(episode: { air_date: string | null } | null): boolean {
    return episode?.air_date != null && episode.air_date <= localToday();
}
