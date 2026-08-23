<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Whether TMDB reports the show as concluded ("Ended" / "Canceled") — no
     * further episodes expected. Drives auto-finishing a user's tracking once
     * they have watched everything. Refreshed nightly, since a concluded show
     * can be revived with new seasons later.
     */
    public function up(): void
    {
        Schema::table('shows', function (Blueprint $table): void {
            $table->boolean('ended')->default(false)->after('overview');
        });
    }

    public function down(): void
    {
        Schema::table('shows', function (Blueprint $table): void {
            $table->dropColumn('ended');
        });
    }
};
