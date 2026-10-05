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

async function lightingResponse(
    url: string,
    options: RequestInit = {},
): Promise<Response> {
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

    return response;
}

export async function lightingRequest<T>(
    url: string,
    options: RequestInit = {},
): Promise<T> {
    const response = await lightingResponse(url, options);

    return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
}

export async function downloadLightingJson(
    url: string,
    layout: unknown,
): Promise<void> {
    const response = await lightingResponse(url, {
        method: 'POST',
        body: JSON.stringify({ layout }),
    });
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        disposition.match(/filename=([^;\s]+)/)?.[1] ??
        'lighting-design.lighting.json';
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function lightingErrorMessage(error: unknown): string {
    if (error instanceof LightingApiError) {
        return Object.values(error.errors).flat()[0] ?? error.message;
    }

    return error instanceof Error
        ? error.message
        : 'The lighting design could not be saved.';
}
