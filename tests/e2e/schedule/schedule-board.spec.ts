import { expect, test } from '@playwright/test';

const scheduleUrl = 'http://schedule.localhost:8000';

test.beforeEach(async ({ context, page }) => {
    const cookies = await context.cookies();

    await context.addCookies(
        cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            url: scheduleUrl,
        })),
    );

    await page.goto(scheduleUrl);
    await expect(
        page.getByRole('heading', { name: 'Schedule Board' }),
    ).toBeVisible();
});

test('resources, jobs, conflicts, backup restore, and refresh persist', async ({
    page,
}) => {
    await page.getByRole('button', { name: 'Resources' }).click();
    const resourceDialog = page.getByRole('dialog', {
        name: 'Manage resources',
    });
    await resourceDialog.getByLabel('New resource label').fill('E2E server');
    await resourceDialog.getByLabel('Subtitle').fill('Primary node');
    await resourceDialog.getByRole('button', { name: 'Add' }).click();
    await expect(
        resourceDialog.getByLabel('Label', { exact: true }),
    ).toHaveValue('E2E server');
    await resourceDialog.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Add job' }).click();
    const jobDialog = page.getByRole('dialog', { name: 'Add job' });
    await jobDialog.getByLabel('Job name').fill('E2E backup');
    await jobDialog.getByLabel('Start time').fill('09:00');
    await jobDialog.getByLabel('Minutes').fill('120');
    await jobDialog.getByLabel(/E2E server/).check();
    await jobDialog.getByRole('button', { name: 'Save job' }).click();
    await expect(jobDialog).toBeHidden();

    await page.getByRole('button', { name: 'Add job' }).click();
    const secondJobDialog = page.getByRole('dialog', { name: 'Add job' });
    await secondJobDialog.getByLabel('Job name').fill('E2E replication');
    await secondJobDialog.getByLabel('Start time').fill('10:00');
    await secondJobDialog.getByLabel('Minutes').fill('90');
    await secondJobDialog.getByLabel(/E2E server/).check();
    await secondJobDialog.getByRole('button', { name: 'Save job' }).click();
    await expect(secondJobDialog).toBeHidden();

    const conflictStatus = page.getByRole('alert').filter({
        hasText: 'E2E backup overlaps E2E replication',
    });
    await expect(conflictStatus).toContainText('E2E server');
    await expect(conflictStatus).toContainText('10:00–11:00');

    await page
        .getByRole('button', { name: /E2E replication/ })
        .last()
        .click();
    const editDialog = page.getByRole('dialog', { name: 'Edit job' });
    await editDialog.getByLabel('Job name').fill('E2E replication edited');
    await editDialog.getByRole('button', { name: 'Save job' }).click();
    await expect(editDialog).toBeHidden();
    await expect(
        page.getByText('E2E replication edited').first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Backup / Restore' }).click();
    const exportDialog = page.getByRole('dialog', { name: 'Backup / Restore' });
    const exportedJson = await exportDialog
        .getByLabel('Schedule JSON')
        .inputValue();
    const importedBoard = JSON.parse(exportedJson);
    expect(importedBoard.jobs).toHaveLength(2);
    importedBoard.resources[0].label = 'E2E server restored';
    await exportDialog
        .getByLabel('Schedule JSON')
        .fill(JSON.stringify(importedBoard));
    await exportDialog.getByLabel('Merge by portable IDs').check();
    await exportDialog
        .getByRole('button', { name: 'Restore from JSON' })
        .click();
    await expect(exportDialog).toBeHidden();

    await page.reload();
    await expect(page.getByText('E2E backup').first()).toBeVisible();
    await expect(
        page.getByText('E2E replication edited').first(),
    ).toBeVisible();
    await expect(page.getByText('E2E server restored').first()).toBeVisible();
});
