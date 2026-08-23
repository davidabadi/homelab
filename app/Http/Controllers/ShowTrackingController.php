<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Enums\ShowStatus;
use App\Http\Requests\SetShowStatusRequest;
use App\Http\Requests\TrackShowRequest;
use App\Http\Requests\UpdateShowStatusRequest;
use App\Models\Show;
use App\Models\UserShowTracking;
use App\Services\Library\MediaLibraryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Show tracking for the logged-in user (spec §10 item 5): add a show to their
 * list with a status, and move it between statuses.
 *
 * Every action is scoped to the authenticated user. Reads/writes go through
 * $request->user()->showTrackings(), so one household member can never see or
 * touch another's rows even by guessing an id — a foreign id simply 404s.
 *
 * Responses are JSON for now so these routes can be driven directly (curl /
 * Postman / tests) before any frontend exists; they become Inertia responses
 * when the Shows screens land (spec build-order items 8–9).
 */
class ShowTrackingController extends Controller
{
    /**
     * Track a show: find-or-create the shared Show (pulling its full
     * season/episode data from TMDB the first time the household sees it), then
     * create this user's tracking row as Watching if it does not exist.
     */
    public function store(TrackShowRequest $request, MediaLibraryService $library): JsonResponse
    {
        $show = $library->findOrCreateShow((int) $request->integer('tmdb_id'));

        $tracking = $request->user()->showTrackings()->firstOrCreate(
            ['show_id' => $show->id],
            ['status' => ShowStatus::Watching],
        );

        return response()->json([
            'tracking' => $this->present($tracking),
            'show' => [
                'id' => $show->id,
                'title' => $show->title,
                'seasons' => $show->seasons()->count(),
                'episodes' => $show->episodes()->count(),
            ],
        ], $tracking->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Move one of this user's tracked shows to a new status.
     */
    public function update(UpdateShowStatusRequest $request, int $tracking): JsonResponse
    {
        // Scoped to the user's own rows — a foreign tracking id 404s here.
        $model = $request->user()->showTrackings()->findOrFail($tracking);

        $model->update(['status' => $request->status()]);

        return response()->json(['tracking' => $this->present($model)]);
    }

    /**
     * Left-swipe status move keyed by the shared show id (spec Part 2 §2):
     * "Watch Later" and "Stop Watching" from the row's action sheet. Limited to
     * those two target statuses (SetShowStatusRequest); scoped to the user's own
     * tracking row, a no-op if the show isn't tracked.
     */
    public function setStatus(SetShowStatusRequest $request, Show $show): JsonResponse
    {
        $tracking = $request->user()->showTrackings()->where('show_id', $show->id)->first();

        if ($tracking !== null) {
            $tracking->update(['status' => $request->status()]);
        }

        return response()->json(['status' => $tracking?->status->value]);
    }

    /**
     * Left-swipe "Remove" (spec Part 2 §2): drop this user's tracking row only.
     * Deliberately distinct from destroy() — it must NEVER delete episode-watch
     * rows. The menu only offers Remove when the show has no watched episodes, so
     * there's normally no history at stake; even so, this fails safe and leaves
     * any UserEpisodeWatch rows untouched rather than silently discarding watch
     * history. Keyed by shared show id, scoped to the user, idempotent.
     */
    public function removeFromList(Request $request, Show $show): JsonResponse
    {
        $request->user()->showTrackings()->where('show_id', $show->id)->delete();

        return response()->json(['tracked' => false]);
    }

    /**
     * Untrack a show for this user: the tracking row goes away AND every one
     * of their episode-watch rows for the show is deleted — untracking means
     * "start from scratch", not "hide but remember". Keyed by the shared show
     * id (that's what the UI knows); only the current user's rows are touched.
     * Idempotent: untracking an untracked show is a no-op.
     */
    public function destroy(Request $request, Show $show): JsonResponse
    {
        $request->user()->showTrackings()->where('show_id', $show->id)->delete();

        $request->user()->episodeWatches()
            ->whereIn('episode_id', $show->episodes()->select('id'))
            ->delete();

        return response()->json(['tracked' => false]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(UserShowTracking $tracking): array
    {
        return [
            'id' => $tracking->id,
            'user_id' => $tracking->user_id,
            'show_id' => $tracking->show_id,
            'status' => $tracking->status->value,
        ];
    }
}
