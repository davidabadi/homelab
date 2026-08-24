export class PresenceApiError extends Error {
    constructor(
        message: string,
        public readonly errors: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function csrfToken(): string {
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.split('=')[1];

    return token ? decodeURIComponent(token) : '';
}

export async function presenceRequest<T>(
    url: string,
    options: RequestInit = {},
): Promise<T> {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            Accept: 'application/json',
            'X-XSRF-TOKEN': csrfToken(),
            ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
            message?: string;
            errors?: Record<string, string[]>;
        };

        throw new PresenceApiError(
            body.message ?? `The server returned ${response.status}.`,
            body.errors,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

export function presenceErrorMessage(error: unknown): string {
    if (error instanceof PresenceApiError) {
        return Object.values(error.errors).flat()[0] ?? error.message;
    }

    return error instanceof Error
        ? error.message
        : 'The request could not be completed.';
}
