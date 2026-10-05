<?php

namespace Database\Seeders;

use App\Models\LightingComponentDefinition;
use Illuminate\Database\Seeder;

class LightingComponentCatalogSeeder extends Seeder
{
    public function run(): void
    {
        $examples = [
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a01',
                'manufacturer' => 'Shelly', 'model' => 'SPDM-002PE01EU',
                'display_name' => 'Shelly Pro Dimmer 2PM', 'category' => 'din-dimmer',
                'width_mm' => 19, 'height_mm' => 94, 'depth_mm' => 69,
                'image_url' => 'https://kb.shelly.cloud/__attachments/a_2ee155be9b66b5abdd7379e56c21515cc162465832ec671df50f327bb03ee545/Shelly%20Pro%20DImmer%202PM.jpg',
                'datasheet_url' => 'https://kb.shelly.cloud/knowledge-base/shelly-pro-dimmer-2pm',
                'terminals' => $this->terminals(['SW1', 'SW2', 'SW3', 'SW4', 'O1', 'O2', 'L1', 'L2', 'N', 'LAN'], 19, 94),
                'metadata' => ['sample_terminal_positions' => true, 'verified_dimensions' => true],
                'description' => 'Manufacturer dimensions: W 19 × H 94 × D 69 mm. Terminal positions and mounting anchor are schematic samples; verify against the actual device.',
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a02',
                'manufacturer' => 'Shelly', 'model' => 'SPSW-104PE16EU',
                'display_name' => 'Shelly Pro 4PM (V2)', 'category' => 'din-relay',
                'width_mm' => 53, 'height_mm' => 96, 'depth_mm' => 59,
                'image_url' => 'https://kb.shelly.cloud/__attachments/a_5abd601362a38d3ca159886f259a3a9bb6ee26eb596b9d9b9f37f54b90426486/Shelly%204Pro%20PM%20V2.jpg',
                'datasheet_url' => 'https://kb.shelly.cloud/knowledge-base/shelly-pro-4pm-v2',
                'terminals' => $this->terminals(['S1', 'S2', 'S3', 'S4', 'O1', 'O2', 'O3', 'O4', 'L', 'N', 'LAN'], 53, 96),
                'metadata' => ['sample_terminal_positions' => true, 'verified_dimensions' => true],
                'description' => 'Manufacturer V2 dimensions: W 53 × H 96 × D 59 mm. Terminal positions and mounting anchor are schematic samples; verify against the actual device.',
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a03',
                'model' => 'TS35 sample', 'display_name' => 'Generic DIN rail (sample)',
                'category' => 'din-rail', 'kind' => 'rail', 'mounting_type' => 'panel',
                'width_mm' => 300, 'height_mm' => 35, 'depth_mm' => 7.5, 'terminals' => [],
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a04',
                'model' => '40×40 sample', 'display_name' => 'Generic slotted wire duct (sample)',
                'category' => 'wire-duct', 'kind' => 'duct', 'mounting_type' => 'panel',
                'width_mm' => 300, 'height_mm' => 40, 'depth_mm' => 40, 'terminals' => [],
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a05',
                'model' => 'Terminal sample', 'display_name' => 'Generic terminal block (sample)',
                'category' => 'terminal-block', 'width_mm' => 5.2, 'height_mm' => 50,
                'depth_mm' => 45, 'terminals' => $this->terminals(['1', '2'], 5.2, 50),
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a06',
                'model' => '24V sample', 'display_name' => 'Generic 24V DIN power supply (sample)',
                'category' => 'power-supply', 'width_mm' => 72, 'height_mm' => 90,
                'depth_mm' => 60, 'terminals' => $this->terminals(['L', 'N', 'PE', '24V+', 'GND'], 72, 90),
            ],
            [
                'catalog_family_id' => '6285f5bf-3030-40a0-8ff2-50d8b0c70a07',
                'model' => 'ESP32 I/O sample', 'display_name' => 'Generic ESP32 / I/O controller (sample)',
                'category' => 'controller', 'mounting_type' => 'pcb',
                'width_mm' => 90, 'height_mm' => 70, 'depth_mm' => 25,
                'terminals' => $this->terminals(['24V+', 'GND', 'GPIO01', 'GPIO02', 'LAN'], 90, 70),
            ],
        ];

        foreach ($examples as $example) {
            $defaults = [
                'revision' => 1, 'manufacturer' => 'Generic', 'kind' => 'component',
                'sku' => null, 'din_modules' => null, 'mounting_type' => 'din-rail',
                'image_path' => null, 'image_url' => null, 'datasheet_url' => null,
                'description' => 'Sample dimensions and terminals for layout testing. Edit a new catalog revision to match your actual product.',
                'metadata' => ['sample_dimensions' => true, 'sample_terminal_positions' => true],
                'mounting_anchor_x_mm' => $example['width_mm'] / 2,
                'mounting_anchor_y_mm' => $example['height_mm'] / 2,
                'archived_at' => null,
            ];
            LightingComponentDefinition::query()->firstOrCreate(
                ['catalog_family_id' => $example['catalog_family_id'], 'revision' => 1],
                [...$defaults, ...$example],
            );
        }
    }

    /** @param list<string> $keys
     * @return list<array{key: string, label: string, x_mm: float, y_mm: float, side: string, purpose: string}>
     */
    private function terminals(array $keys, float $width, float $height): array
    {
        $topCount = (int) ceil(count($keys) / 2);
        $bottomCount = count($keys) - $topCount;
        $terminals = [];
        foreach ($keys as $index => $key) {
            $top = $index < $topCount;
            $terminalIndex = $top ? $index : $index - $topCount;
            $terminalCount = $top ? $topCount : $bottomCount;
            $terminals[] = [
                'key' => $key,
                'label' => in_array($key, ['L1', 'L2'], true) ? 'L' : $key,
                'x_mm' => round($width * ($terminalIndex + 1) / ($terminalCount + 1), 2),
                'y_mm' => $top ? 0.0 : $height,
                'side' => $top ? 'top' : 'bottom',
                'purpose' => $key === 'LAN' ? 'network' : 'sample',
            ];
        }

        return $terminals;
    }
}
