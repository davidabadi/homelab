<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user show list membership + status. Fully private per user.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_show_tracking', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('show_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('watching'); // watching | watch_later | finished | stopped
            $table->timestamps();

            $table->unique(['user_id', 'show_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_show_tracking');
    }
};
