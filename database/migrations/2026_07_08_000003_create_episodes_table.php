<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shared episode metadata. air_date is indexed for the "Upcoming" query.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('episodes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('show_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('season_number');
            $table->unsignedInteger('episode_number');
            $table->string('title')->nullable();
            $table->string('still_image_url')->nullable();
            $table->text('overview')->nullable();
            $table->date('air_date')->nullable();
            $table->unsignedInteger('runtime_minutes')->nullable();
            $table->timestamps();

            $table->unique(['show_id', 'season_number', 'episode_number']);
            $table->index('air_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('episodes');
    }
};
