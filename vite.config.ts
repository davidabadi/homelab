import inertia from '@inertiajs/vite';
import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600],
                }),
            ],
        }),
        inertia(),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        wayfinder({
            formVariants: true,
        }),
        // PWA on top of laravel-vite-plugin. Laravel builds into public/build,
        // so sw.js and manifest.webmanifest land there too (vite-plugin-pwa
        // can't emit them elsewhere — see vite-pwa/vite-plugin-pwa#431/#467).
        // buildBase makes the precache manifest use the /build/ URL prefix;
        // the service worker itself is served from the root as /sw.js by a
        // Laravel route so its scope can be "/" without a
        // Service-Worker-Allowed header, and registration happens manually in
        // app.tsx instead of via the virtual module.
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            buildBase: '/build/',
            manifest: {
                name: 'TV Time',
                short_name: 'TV Time',
                description:
                    'Household TV show and movie tracker — what am I watching, what is next, what is coming.',
                id: '/',
                scope: '/',
                start_url: '/',
                display: 'standalone',
                background_color: '#0a0a0a',
                theme_color: '#0a0a0a',
                icons: [
                    {
                        src: '/icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/icon-512-maskable.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // Single-file sw.js (no relative workbox-*.js import) so it
                // still works when served from /sw.js instead of /build/sw.js.
                inlineWorkboxRuntime: true,
                sourcemap: false,
                // Precache the built app shell: JS, CSS and fonts in public/build.
                globPatterns: ['**/*.{js,css,woff,woff2}'],
                // laravel-vite-plugin builds with an empty Vite base (Laravel
                // prefixes /build/ at runtime via the manifest), so workbox
                // emits relative precache URLs like "assets/app-*.js". Those
                // only resolve correctly relative to /build/sw.js — our SW is
                // served from /sw.js, so make every entry absolute.
                modifyURLPrefix: { '': '/build/' },
                // Inertia pages are server-rendered Laravel responses; there is
                // no index.html to fall back to, so never hijack navigations.
                navigateFallback: null,
                runtimeCaching: [
                    {
                        // TMDB posters/stills — cache-first, they're immutable per URL.
                        urlPattern: /^https:\/\/image\.tmdb\.org\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'tmdb-images',
                            expiration: {
                                maxEntries: 500,
                                maxAgeSeconds: 60 * 60 * 24 * 30,
                            },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        // App icons and any other local static images.
                        urlPattern: /\/(icons|images)\/.*\.(png|svg|webp)$/i,
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'static-images' },
                    },
                ],
            },
        }),
    ],
});
