<?php

declare(strict_types=1);

namespace App\Services\Metadata\Data;

/**
 * The kinds of media the tracker handles. Values match the `media_type`
 * column on `media_external_ids` ('show' | 'movie'), so search results can
 * be persisted directly in a later session without translation.
 */
enum MediaType: string
{
    case Show = 'show';
    case Movie = 'movie';
}
