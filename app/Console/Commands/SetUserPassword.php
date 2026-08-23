<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

class SetUserPassword extends Command
{
    protected $signature = 'app:set-user-password
                            {--email= : The user\'s email address}
                            {--password= : The user\'s new password (prompted securely if omitted)}';

    protected $description = 'Set a new password for a household user account';

    public function handle(): int
    {
        $email = $this->option('email') ?: text(
            label: 'Email',
            required: true,
        );

        $plainPassword = $this->option('password') ?: password(
            label: 'New password',
            required: true,
            validate: ['password' => ['string', Password::default()]],
        );

        $validator = Validator::make(
            ['email' => $email, 'password' => $plainPassword],
            [
                'email' => ['required', 'email', 'max:255'],
                'password' => ['required', 'string', Password::default()],
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->error("No user was found with the email address {$email}.");

            return self::FAILURE;
        }

        $user->update(['password' => $plainPassword]);

        $this->info("Updated password for user #{$user->id}: {$user->name} <{$user->email}>");

        return self::SUCCESS;
    }
}
