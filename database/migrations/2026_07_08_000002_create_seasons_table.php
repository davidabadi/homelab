<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shared season metadata. episode_count is cached from TMDB.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seasons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('show_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('season_number');
            $table->unsignedInteger('episode_count')->default(0);
            $table->timestamps();

            $table->unique(['show_id', 'season_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seasons');
    }
};
