<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Profile\ProfileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    public function __construct(private readonly ProfileService $profiles) {}

    public function index(Request $request): Response
    {
        return Inertia::render('profile', $this->profiles->profile($this->user($request)));
    }

    public function shows(Request $request): JsonResponse
    {
        return response()->json($this->profiles->showLibrary($this->user($request)));
    }

    public function movies(Request $request): JsonResponse
    {
        return response()->json($this->profiles->movieLibrary($this->user($request)));
    }

    private function user(Request $request): User
    {
        $user = $request->user();

        assert($user instanceof User);

        return $user;
    }
}
