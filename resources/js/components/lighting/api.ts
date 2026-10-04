export class LightingApiError extends Error {
    readonly status: number;
    readonly errors: Record<string, string[]>;

    constructor(
        message: string,
        status: number,
        errors: Record<string, string[]> = {},
    ) {
        super(message);
        this.status = status;
        this.errors = errors;
    }
}

function csrfToken(): string {
    const token = document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
        ?.slice('XSRF-TOKEN='.length);

    return token ? decodeURIComponent(token) : '';
}

export async function lightingRequest<T>(
    url: string,
    options: RequestInit = {},
): Promise<T> {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            Accept: 'application/json',
            'X-XSRF-TOKEN': csrfToken(),
            ...(!(options.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...options.headers,
        },
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
            message?: string;
            errors?: Record<string, string[]>;
        };

        throw new LightingApiError(
            body.message ?? `The server returned ${response.status}.`,
            response.status,
            body.errors,
        );
    }

    return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
}

export function lightingErrorMessage(error: unknown): string {
    if (error instanceof LightingApiError) {
        return Object.values(error.errors).flat()[0] ?? error.message;
    }

    return error instanceof Error
        ? error.message
        : 'The lighting design could not be saved.';
}
