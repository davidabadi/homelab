<?php

declare(strict_types=1);

namespace App\Enums;

enum YamtrackMediaType: string
{
    case Tv = 'tv';
    case Season = 'season';
    case Episode = 'episode';
    case Movie = 'movie';
}
