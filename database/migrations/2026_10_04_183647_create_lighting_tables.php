<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lighting_designs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->decimal('width_mm', 12, 3)->default(600);
            $table->decimal('height_mm', 12, 3)->default(800);
            $table->decimal('depth_mm', 12, 3)->nullable();
            foreach (['top', 'right', 'bottom', 'left'] as $side) {
                $table->decimal("margin_{$side}_mm", 12, 3)->default(0);
            }
            $table->decimal('grid_size_mm', 12, 3)->default(5);
            $table->boolean('snap_to_grid')->default(true);
            $table->text('notes')->nullable();
            $table->unsignedInteger('save_version')->default(0);
            $table->uuid('last_mutation_id')->nullable();
            $table->string('last_mutation_hash', 64)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'updated_at']);
        });

        Schema::create('lighting_component_definitions', function (Blueprint $table): void {
            $table->id();
            $table->uuid('catalog_family_id');
            $table->unsignedInteger('revision');
            $table->string('manufacturer');
            $table->string('model');
            $table->string('display_name');
            $table->string('category');
            $table->string('kind')->default('component');
            $table->string('sku')->nullable();
            $table->decimal('width_mm', 12, 3);
            $table->decimal('height_mm', 12, 3);
            $table->decimal('depth_mm', 12, 3)->nullable();
            $table->decimal('din_modules', 8, 3)->nullable();
            $table->string('mounting_type');
            $table->decimal('mounting_anchor_x_mm', 12, 3);
            $table->decimal('mounting_anchor_y_mm', 12, 3);
            $table->string('image_path')->nullable();
            $table->text('image_url')->nullable();
            $table->text('datasheet_url')->nullable();
            $table->text('description')->nullable();
            $table->jsonb('terminals');
            $table->jsonb('metadata')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
            $table->unique(['catalog_family_id', 'revision']);
        });

        Schema::create('lighting_design_rails', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('design_id')->constrained('lighting_designs')->cascadeOnDelete();
            $table->uuid('portable_id');
            $table->foreignId('component_definition_id')->nullable()->constrained('lighting_component_definitions')->restrictOnDelete();
            $table->decimal('x_mm', 12, 3);
            $table->decimal('y_mm', 12, 3);
            $table->decimal('length_mm', 12, 3);
            $table->decimal('width_mm', 12, 3);
            $table->timestamps();
            $table->unique(['design_id', 'portable_id']);
        });

        Schema::create('lighting_design_ducts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('design_id')->constrained('lighting_designs')->cascadeOnDelete();
            $table->uuid('portable_id');
            $table->foreignId('component_definition_id')->nullable()->constrained('lighting_component_definitions')->restrictOnDelete();
            $table->decimal('x_mm', 12, 3);
            $table->decimal('y_mm', 12, 3);
            $table->decimal('length_mm', 12, 3);
            $table->decimal('width_mm', 12, 3);
            $table->string('orientation');
            $table->timestamps();
            $table->unique(['design_id', 'portable_id']);
        });

        Schema::create('lighting_design_components', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('design_id')->constrained('lighting_designs')->cascadeOnDelete();
            $table->uuid('portable_id');
            $table->foreignId('component_definition_id')->constrained('lighting_component_definitions')->restrictOnDelete();
            $table->foreignId('rail_id')->nullable()->constrained('lighting_design_rails')->nullOnDelete();
            $table->decimal('x_mm', 12, 3);
            $table->decimal('y_mm', 12, 3);
            $table->unsignedSmallInteger('rotation')->default(0);
            $table->string('custom_label')->nullable();
            $table->text('notes')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
            $table->unique(['design_id', 'portable_id']);
        });

        Schema::create('lighting_design_connections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('design_id')->constrained('lighting_designs')->cascadeOnDelete();
            $table->uuid('portable_id');
            $table->foreignId('source_component_id')->constrained('lighting_design_components')->cascadeOnDelete();
            $table->string('source_terminal');
            $table->foreignId('target_component_id')->constrained('lighting_design_components')->cascadeOnDelete();
            $table->string('target_terminal');
            $table->string('cable_type');
            $table->string('color')->nullable();
            $table->string('gauge')->nullable();
            $table->unsignedSmallInteger('conductor_count')->default(1);
            $table->jsonb('route_points');
            $table->decimal('actual_length_mm', 12, 3)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['design_id', 'portable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lighting_design_connections');
        Schema::dropIfExists('lighting_design_components');
        Schema::dropIfExists('lighting_design_ducts');
        Schema::dropIfExists('lighting_design_rails');
        Schema::dropIfExists('lighting_component_definitions');
        Schema::dropIfExists('lighting_designs');
    }
};
