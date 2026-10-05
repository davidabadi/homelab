<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lighting_design_rails', function (Blueprint $table): void {
            $table->unsignedInteger('sort_order')->default(0);
            $table->index(['design_id', 'sort_order']);
        });
        Schema::table('lighting_design_components', function (Blueprint $table): void {
            $table->unsignedInteger('sort_order')->default(0);
            $table->index(['design_id', 'rail_id', 'sort_order']);
        });

        DB::table('lighting_designs')->orderBy('id')->chunkById(100, function ($designs): void {
            foreach ($designs as $design) {
                $rails = DB::table('lighting_design_rails')->where('design_id', $design->id)->orderBy('y_mm')->orderBy('id')->get(['id']);
                foreach ($rails as $order => $rail) {
                    DB::table('lighting_design_rails')->where('id', $rail->id)->update(['sort_order' => $order]);
                }

                $orders = [];
                $components = DB::table('lighting_design_components')->where('design_id', $design->id)
                    ->orderBy('x_mm')->orderBy('id')->get(['id', 'rail_id']);
                foreach ($components as $component) {
                    $group = $component->rail_id ?? 'unassigned';
                    $order = $orders[$group] ?? 0;
                    DB::table('lighting_design_components')->where('id', $component->id)->update(['sort_order' => $order]);
                    $orders[$group] = $order + 1;
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('lighting_design_components', function (Blueprint $table): void {
            $table->dropIndex(['design_id', 'rail_id', 'sort_order']);
            $table->dropColumn('sort_order');
        });
        Schema::table('lighting_design_rails', function (Blueprint $table): void {
            $table->dropIndex(['design_id', 'sort_order']);
            $table->dropColumn('sort_order');
        });
    }
};
