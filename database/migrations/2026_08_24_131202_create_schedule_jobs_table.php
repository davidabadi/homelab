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
        Schema::create('schedule_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('portable_id');
            $table->string('name');
            $table->time('start_time');
            $table->unsignedInteger('duration_minutes');
            $table->jsonb('weekdays');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'portable_id']);
            $table->index(['user_id', 'start_time']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('schedule_jobs');
    }
};
