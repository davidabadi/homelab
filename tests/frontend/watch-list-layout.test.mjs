import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    positionRelativeTo,
    scrollTopAfterPrepend,
    scrollTopAtAnchor,
    shouldLoadOlderHistory,
} from '../../resources/js/lib/watch-list-layout.ts';

test('collection cards reserve two title lines and a year row', async () => {
    const component = await readFile(
        new URL(
            '../../resources/js/components/movie-detail-modal.tsx',
            import.meta.url,
        ),
        'utf8',
    );

    assert.match(component, /line-clamp-2 min-h-\[2lh\]/);
    assert.match(component, /part\.year \?\? '\\u00a0'/);
    assert.match(component, /isCurrent &&\s*'ring-2 ring-emerald-500'/);
});

test('initial history hydration positions the structural watch-list anchor', () => {
    assert.equal(scrollTopAtAnchor(0, 640, 120), 520);
    assert.equal(scrollTopAtAnchor(35, 820, 120), 735);
});

test('older history prepends preserve the content under the viewport', () => {
    assert.equal(scrollTopAfterPrepend(6, 1800, 1200), 606);
});

test('programmatic placement does not request another history page', () => {
    assert.equal(shouldLoadOlderHistory(520, 0, true, 8), false);
    assert.equal(shouldLoadOlderHistory(0, 520, false, 8), false);
    assert.equal(shouldLoadOlderHistory(0, 520, true, 8), true);
});

test('FLIP positions ignore scroll and content movement above the list', () => {
    const before = positionRelativeTo(
        { left: 40, top: 700 },
        { left: 20, top: 500 },
    );
    const afterHistoryPrepend = positionRelativeTo(
        { left: 40, top: 1100 },
        { left: 20, top: 900 },
    );

    assert.deepEqual(before, afterHistoryPrepend);
});

test('episode reconciliation is not coordinated by arbitrary timers', async () => {
    const page = await readFile(
        new URL('../../resources/js/pages/shows.tsx', import.meta.url),
        'utf8',
    );

    assert.doesNotMatch(page, /setTimeout/);
    assert.match(page, /onSuccess:[\s\S]*reloadList/);
    assert.match(page, /mutationRef\.current !== null/);
});

test('a row remounted into another section releases its overlay lock', async () => {
    const [page, styles] = await Promise.all([
        readFile(
            new URL('../../resources/js/pages/shows.tsx', import.meta.url),
            'utf8',
        ),
        readFile(
            new URL('../../resources/css/app.css', import.meta.url),
            'utf8',
        ),
    ]);

    assert.match(page, /event\.animationName === 'watch-sweep-out'/);
    assert.match(page, /completeTransitionPart\('overlay'\)/);
    assert.doesNotMatch(page, /onTransitionEnd=/);
    assert.match(styles, /@keyframes watch-sweep-out/);
});

test('show and movie page headings are hidden below the desktop breakpoint', async () => {
    const pages = await Promise.all(
        [
            '../../resources/js/pages/shows.tsx',
            '../../resources/js/pages/shows/upcoming.tsx',
            '../../resources/js/pages/movies.tsx',
            '../../resources/js/pages/movies/upcoming.tsx',
        ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );

    for (const page of pages) {
        assert.match(page, /<div className="hidden md:block">\s*<Heading/);
    }
});

test('an unwatched toggle turns green and animates immediately on tap', async () => {
    const [toggle, styles] = await Promise.all([
        readFile(
            new URL(
                '../../resources/js/components/watched-toggle.tsx',
                import.meta.url,
            ),
            'utf8',
        ),
        readFile(
            new URL('../../resources/css/app.css', import.meta.url),
            'utf8',
        ),
    ]);

    assert.match(toggle, /setShowActivationFeedback\(true\)/);
    assert.match(toggle, /watched \|\| showActivationFeedback/);
    assert.match(toggle, /animate-watched-toggle/);
    assert.match(styles, /@keyframes watched-toggle-pop/);
    assert.match(
        styles,
        /prefers-reduced-motion:[\s\S]*animate-watched-toggle/,
    );
});
