<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\YamtrackImportStatus;
use App\Enums\YamtrackImportStrategy;
use Carbon\CarbonImmutable;
use Database\Factories\YamtrackImportFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int|null $active_user_id
 * @property YamtrackImportStrategy $strategy
 * @property YamtrackImportStatus $status
 * @property string $original_filename
 * @property string $stored_path
 * @property string $file_hash
 * @property int|null $total_rows
 * @property int $processed_rows
 * @property int $successful_rows
 * @property int $skipped_rows
 * @property int $failed_rows
 * @property int $shows_added
 * @property int $shows_removed
 * @property int $episodes_marked_watched
 * @property int $episodes_reset
 * @property int $movies_added
 * @property int $movies_removed
 * @property int $movies_marked_watched
 * @property int $movies_reset
 * @property CarbonImmutable|null $started_at
 * @property CarbonImmutable|null $completed_at
 * @property string|null $failure_message
 * @property list<array{row: int, reason: string}>|null $error_summary
 */
class YamtrackImport extends Model
{
    /** @use HasFactory<YamtrackImportFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id', 'active_user_id', 'strategy', 'status', 'original_filename',
        'stored_path', 'file_hash', 'total_rows', 'processed_rows', 'successful_rows',
        'skipped_rows', 'failed_rows', 'shows_added', 'shows_removed',
        'episodes_marked_watched', 'episodes_reset', 'movies_added', 'movies_removed',
        'movies_marked_watched', 'movies_reset', 'started_at', 'completed_at',
        'failure_message', 'error_summary',
    ];

    protected $attributes = [
        'status' => 'pending', 'processed_rows' => 0, 'successful_rows' => 0,
        'skipped_rows' => 0, 'failed_rows' => 0, 'shows_added' => 0,
        'shows_removed' => 0, 'episodes_marked_watched' => 0, 'episodes_reset' => 0,
        'movies_added' => 0, 'movies_removed' => 0, 'movies_marked_watched' => 0,
        'movies_reset' => 0,
    ];

    protected function casts(): array
    {
        return [
            'strategy' => YamtrackImportStrategy::class,
            'status' => YamtrackImportStatus::class,
            'error_summary' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
