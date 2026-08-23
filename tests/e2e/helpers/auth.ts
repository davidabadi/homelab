import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function login(
    page: Page,
    email = 'e2e@example.test',
): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/shows$/);
}

export const loggedOutStorage = { cookies: [], origins: [] };
