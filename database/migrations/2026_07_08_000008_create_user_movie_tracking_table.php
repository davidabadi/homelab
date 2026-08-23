<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user movie watched state. watched_date is auto-set on toggle but editable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_movie_tracking', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('movie_id')->constrained()->cascadeOnDelete();
            $table->boolean('watched')->default(false);
            $table->timestamp('watched_date')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'movie_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_movie_tracking');
    }
};
