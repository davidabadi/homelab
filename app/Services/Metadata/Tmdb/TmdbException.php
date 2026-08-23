<?php

declare(strict_types=1);

namespace App\Services\Metadata\Tmdb;

use RuntimeException;

/**
 * Thrown when a TMDB request fails (non-2xx response, or a missing/invalid
 * API key). Callers can catch this to distinguish upstream-provider failures
 * from application errors.
 */
final class TmdbException extends RuntimeException {}
