<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // The user's IANA timezone (e.g. "America/New_York"), auto-detected
            // from their browser. Drives the calendar-day cutoff for their
            // Upcoming feed and Watch List. Null until first detected — callers
            // fall back to the app timezone (UTC).
            $table->string('timezone')->nullable()->after('email');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
