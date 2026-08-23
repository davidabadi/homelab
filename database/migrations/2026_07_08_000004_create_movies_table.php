<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shared movie metadata. release_date is indexed for the "Upcoming" query.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('movies', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('poster_image_url')->nullable();
            $table->text('overview')->nullable();
            $table->date('release_date')->nullable();
            $table->unsignedInteger('runtime_minutes')->nullable();
            $table->timestamps();

            $table->index('release_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movies');
    }
};
