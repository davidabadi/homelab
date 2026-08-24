<?php

namespace App\Enums;

enum PresenceTotalBasis: string
{
    case ConfirmedElapsed = 'confirmed_elapsed';
    case ConfirmedScheduled = 'confirmed_scheduled';
    case Projected = 'projected';
    case LegacyWeighted = 'legacy_weighted';

    public const self DEFAULT_PLANNING_BASIS = self::LegacyWeighted;
}
