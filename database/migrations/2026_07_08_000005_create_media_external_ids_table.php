<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Maps our own shared Show/Movie rows to provider lookup keys (tmdb, trakt, ...).
 * Our DB is the source of truth; providers are just external references attached
 * to it. Polymorphic via (media_type, media_id) — no DB-level FK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_external_ids', function (Blueprint $table) {
            $table->id();
            $table->string('media_type'); // 'show' | 'movie'
            $table->unsignedBigInteger('media_id');
            $table->string('provider');   // 'tmdb' | 'trakt' | ...
            $table->string('external_id');
            $table->timestamps();

            // A given provider's external id maps to exactly one media row.
            $table->unique(['provider', 'media_type', 'external_id']);
            $table->index(['media_type', 'media_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media_external_ids');
    }
};
