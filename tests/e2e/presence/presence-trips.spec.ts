import { expect, test } from '@playwright/test';

const presenceUrl = 'http://presence.localhost:8000';

test.beforeEach(async ({ context, page }) => {
    const cookies = await context.cookies();

    await context.addCookies(
        cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            url: presenceUrl,
        })),
    );

    await page.goto(presenceUrl);
    await expect(page.getByText('US Presence', { exact: true })).toBeVisible();
});

test('adds confirms edits and deletes a trip while dashboard totals follow', async ({
    page,
}) => {
    await page.getByRole('button', { name: 'Add trip' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add trip' });
    await addDialog.getByLabel('Entry date').fill('2026-01-10');
    await addDialog.getByLabel('Scheduled departure date').fill('2026-01-12');
    await addDialog.getByLabel('Planned').check();
    await addDialog.getByLabel('Notes').fill('E2E presence plan');
    await addDialog.getByRole('button', { name: 'Save trip' }).click();
    await expect(addDialog).toBeHidden();

    const substantialPresenceTest = page.getByTestId('spt-section');
    await expect(substantialPresenceTest).toBeVisible();
    await expect(
        substantialPresenceTest.getByText('Substantial Presence Test', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        substantialPresenceTest
            .getByText('Exact 3-year weighted SPT total')
            .locator('..'),
    ).toContainText('0');
    await expect(
        substantialPresenceTest.getByText('31-day requirement').locator('..'),
    ).toContainText('Not met');
    await expect(
        substantialPresenceTest.getByText('183-day requirement').locator('..'),
    ).toContainText('Not met');
    await expect(
        substantialPresenceTest
            .getByText('Overall Substantial Presence Test')
            .locator('..'),
    ).toContainText('Not met');
    await expect(
        page.getByText('Legacy spreadsheet projection', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Legacy spreadsheet components')).toBeVisible();
    await expect(
        page.getByText('Spreadsheet-compatible weighted total').locator('..'),
    ).toContainText('3');
    await expect(page.getByText('Projected year').locator('..')).toContainText(
        '3',
    );
    await expect(page.getByText('E2E presence plan')).toBeVisible();

    await page
        .getByRole('button', {
            name: 'Edit trip Jan 10, 2026 to Jan 12, 2026',
        })
        .click();
    const editDialog = page.getByRole('dialog', { name: 'Edit trip' });
    await editDialog.getByLabel('Scheduled departure date').fill('2026-01-13');
    await editDialog.getByLabel('Confirmed').check();
    await editDialog.getByRole('button', { name: 'Save trip' }).click();
    await expect(editDialog).toBeHidden();

    await expect(page.getByText('Actual elapsed').locator('..')).toContainText(
        '4',
    );
    await expect(
        substantialPresenceTest
            .getByText('Exact 3-year weighted SPT total')
            .locator('..'),
    ).toContainText('4');
    await page
        .getByRole('button', {
            name: 'Edit trip Jan 10, 2026 to Jan 13, 2026',
        })
        .click();
    page.once('dialog', (dialog) => dialog.accept());
    await page
        .getByRole('dialog', { name: 'Edit trip' })
        .getByRole('button', { name: 'Delete trip' })
        .click();

    await expect(page.getByText('No travel touches 2026')).toBeVisible();
    await expect(page.getByText('Projected year').locator('..')).toContainText(
        '0',
    );
});
