<?php

namespace App\Providers;

use App\Models\Movie;
use App\Models\Show;
use App\Services\Metadata\FakeMetadataProvider;
use App\Services\Metadata\MediaMetadataProvider;
use App\Services\Metadata\Tmdb\TmdbService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // TMDB read-through client. Built from config so app(TmdbService::class)
        // and the MediaMetadataProvider interface both resolve fully wired.
        $this->app->singleton(TmdbService::class, fn (): TmdbService => new TmdbService(
            apiKey: (string) config('services.tmdb.key'),
            baseUrl: (string) config('services.tmdb.base_url'),
            imageBaseUrl: (string) config('services.tmdb.image_base_url'),
        ));

        $this->app->bind(
            MediaMetadataProvider::class,
            app()->environment('e2e') ? FakeMetadataProvider::class : TmdbService::class,
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureDefaults();
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        // media_external_ids.media_type stores 'show'|'movie' (spec §3), not
        // model class names, so pin the polymorphic aliases explicitly.
        Relation::enforceMorphMap([
            'show' => Show::class,
            'movie' => Movie::class,
        ]);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
