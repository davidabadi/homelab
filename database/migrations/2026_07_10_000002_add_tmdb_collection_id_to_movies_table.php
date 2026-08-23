<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * TMDB's collection ("franchise") the movie belongs to, e.g. the Star
     * Wars Collection groups Episodes 1–9 but not spin-offs. Nullable — most
     * movies belong to none. Set at create time and kept fresh by the nightly
     * refresh; the collection's member list itself is fetched read-through
     * from TMDB when a movie detail is opened.
     */
    public function up(): void
    {
        Schema::table('movies', function (Blueprint $table): void {
            $table->unsignedBigInteger('tmdb_collection_id')->nullable()->after('runtime_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('movies', function (Blueprint $table): void {
            $table->dropColumn('tmdb_collection_id');
        });
    }
};
