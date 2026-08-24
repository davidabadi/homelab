<?php

namespace App\Enums;

enum PresenceTotalBasis: string
{
    case ConfirmedElapsed = 'confirmed_elapsed';
    case ConfirmedScheduled = 'confirmed_scheduled';
    case Projected = 'projected';
    case LegacyWeighted = 'legacy_weighted';
}
