import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LightingSaveQueue } from '../../resources/js/components/lighting/save-queue.ts';

const ack = (mutation, version) => ({
    mutation_id: mutation.mutation_id,
    save_version: version,
    updated_at: '2026-10-04T00:00:00Z',
});

test('serializes saves and keeps a newer edit made during an outstanding request', async () => {
    const requests = [];
    let resolveFirst;
    const states = [];
    const queue = new LightingSaveQueue({ x_mm: 0 }, 1, {
        request: async (mutation) => {
            requests.push(mutation);

            if (requests.length === 1) {
                return new Promise((resolve) => {
                    resolveFirst = resolve;
                });
            }

            return ack(mutation, 3);
        },
        onState: (state) => states.push(state.status),
    });
    queue.update({ x_mm: 10 });
    const saving = queue.flush();
    queue.update({ x_mm: 25 });
    assert.equal(requests.length, 1);
    resolveFirst(ack(requests[0], 2));
    await saving;
    assert.deepEqual(
        requests.map((request) => [request.x_mm, request.base_version]),
        [
            [10, 1],
            [25, 2],
        ],
    );
    assert.equal(queue.dirty, false);
    assert.equal(states.at(-1), 'saved');
    queue.dispose();
});

test('retries the same mutation after a lost response before saving subsequent edits', async () => {
    const requests = [];
    const queue = new LightingSaveQueue({ x_mm: 0 }, 4, {
        request: async (mutation) => {
            requests.push(mutation);

            if (requests.length === 1) {
                throw new Error('Response lost');
            }

            return ack(mutation, requests.length === 2 ? 5 : 6);
        },
        onState: () => {},
    });
    queue.update({ x_mm: 10 });
    await assert.rejects(queue.flush(), /Response lost/);
    queue.update({ x_mm: 20 });
    assert.equal(queue.dirty, true);
    await queue.flush();
    assert.equal(requests[0].mutation_id, requests[1].mutation_id);
    assert.equal(requests[1].x_mm, 10);
    assert.equal(requests[2].x_mm, 20);
    assert.equal(requests[2].base_version, 5);
    queue.dispose();
});

test('coalesces debounced edits and permits clearing all objects', async () => {
    const requests = [];
    const queue = new LightingSaveQueue({ components: ['device'] }, 1, {
        request: async (mutation) => {
            requests.push(mutation);

            return ack(mutation, 2);
        },
        onState: () => {},
        debounceMs: 5,
    });
    queue.update({ components: ['a', 'b'] });
    queue.update({ components: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].components, []);
    assert.equal(queue.dirty, false);
    queue.dispose();
});

test('a corrected layout replaces a rejected validation snapshot', async () => {
    const requests = [];
    const queue = new LightingSaveQueue({ width_mm: 600 }, 1, {
        request: async (mutation) => {
            requests.push(mutation);

            if (mutation.width_mm < 1) {
                throw Object.assign(new Error('Invalid width'), {
                    status: 422,
                });
            }

            return ack(mutation, 2);
        },
        onState: () => {},
    });
    queue.update({ width_mm: -1 });
    await assert.rejects(queue.flush(), /Invalid width/);
    queue.update({ width_mm: 700 });
    await queue.flush();
    assert.equal(requests[1].width_mm, 700);
    queue.dispose();
});
