<?php

declare(strict_types=1);

namespace App\Enums;

enum YamtrackImportStrategy: string
{
    case AddMissing = 'add_missing';
    case Replace = 'replace';
}
