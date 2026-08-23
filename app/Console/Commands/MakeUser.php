<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

/**
 * Manually create a household user account. Self-registration is disabled
 * (see config/fortify.php), so this is the only way to add users.
 *
 * Created users are marked email-verified immediately, since there is no
 * outbound mail configured and the app gates authenticated routes behind
 * the `verified` middleware.
 */
class MakeUser extends Command
{
    protected $signature = 'app:make-user
                            {--name= : The user\'s display name}
                            {--email= : The user\'s email address}
                            {--password= : The user\'s password (prompted securely if omitted)}';

    protected $description = 'Create a new household user account';

    public function handle(): int
    {
        $name = $this->option('name') ?: text(
            label: 'Name',
            required: true,
        );

        $email = $this->option('email') ?: text(
            label: 'Email',
            required: true,
        );

        $plainPassword = $this->option('password') ?: password(
            label: 'Password',
            required: true,
            validate: fn (string $value) => strlen($value) < 8
                ? 'The password must be at least 8 characters.'
                : null,
        );

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $plainPassword],
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255', 'unique:users,email'],
                'password' => ['required', 'string', 'min:8'],
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => $plainPassword, // hashed via the model's 'hashed' cast
        ]);

        // email_verified_at isn't in the model's $fillable, so set it directly.
        // Manually-created accounts are considered verified — there is no
        // outbound mail, and authenticated routes sit behind `verified`.
        $user->forceFill(['email_verified_at' => now()])->save();

        $this->info("Created user #{$user->id}: {$user->name} <{$user->email}>");

        return self::SUCCESS;
    }
}
