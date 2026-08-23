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
        Schema::create('yamtrack_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('active_user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->string('strategy');
            $table->string('status')->default('pending')->index();
            $table->string('original_filename');
            $table->string('stored_path');
            $table->string('file_hash', 64);
            $table->unsignedInteger('total_rows')->nullable();
            $table->unsignedInteger('processed_rows')->default(0);
            $table->unsignedInteger('successful_rows')->default(0);
            $table->unsignedInteger('skipped_rows')->default(0);
            $table->unsignedInteger('failed_rows')->default(0);
            $table->unsignedInteger('shows_added')->default(0);
            $table->unsignedInteger('shows_removed')->default(0);
            $table->unsignedInteger('episodes_marked_watched')->default(0);
            $table->unsignedInteger('episodes_reset')->default(0);
            $table->unsignedInteger('movies_added')->default(0);
            $table->unsignedInteger('movies_removed')->default(0);
            $table->unsignedInteger('movies_marked_watched')->default(0);
            $table->unsignedInteger('movies_reset')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('failure_message', 500)->nullable();
            $table->json('error_summary')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('yamtrack_imports');
    }
};
