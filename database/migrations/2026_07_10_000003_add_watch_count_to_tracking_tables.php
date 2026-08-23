<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Watched status becomes a count, not just a boolean: a user can mark an
 * episode or movie watched multiple times (rewatches). `watched` stays as a
 * derived convenience column kept in sync (watched = watch_count > 0) so the
 * existing status queries keep working; `watched_date` still reflects the most
 * recent watch.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['user_episode_watches', 'user_movie_tracking'] as $table) {
            Schema::table($table, function (Blueprint $table): void {
                $table->unsignedInteger('watch_count')->default(0)->after('watched');
            });

            // Backfill: every row already marked watched counts as one watch.
            DB::table($table)->where('watched', true)->update(['watch_count' => 1]);
        }
    }

    public function down(): void
    {
        foreach (['user_episode_watches', 'user_movie_tracking'] as $table) {
            Schema::table($table, function (Blueprint $table): void {
                $table->dropColumn('watch_count');
            });
        }
    }
};
