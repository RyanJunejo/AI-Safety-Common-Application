import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Round status depends on the date; pin it to the day the program details were checked.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
});

test('an applicant applies once, submits to a program, and the program sees the packet', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Apply to AI safety fellowships with one application.' })).toBeVisible();
  await page.getByRole('button', { name: /look around with a sample applicant/i }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Talia' })).toBeVisible();

  // Program directory: only three rounds are open.
  await page.getByRole('link', { name: 'Programs', exact: true }).click();
  await page.getByLabel('Open now only').check();
  await expect(page.getByTestId(/^card-/)).toHaveCount(3);

  // One more recommender request completes Anthropic's requirements.
  await page.getByRole('link', { name: 'Recommenders' }).click();
  await page.getByTestId('rec-3').getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByTestId('rec-3')).toContainText('Requested');

  await page.goto('/#/programs/anthropic-fellows');
  await page.getByLabel(/review Anthropic's AI policy/i).check();
  await page.getByLabel(/Send my Common Application/i).check();
  await page.getByRole('button', { name: 'Submit to Anthropic Fellows' }).click();
  await expect(page.getByTestId('submitted')).toContainText('Submitted');

  // Everything survives a reload.
  await page.reload();
  await expect(page.getByTestId('submitted')).toBeVisible();
  await page.goto('/#/');
  await expect(page.getByTestId('row-anthropic-fellows')).toContainText('Submitted');

  // The program's view, and the spreadsheet it can download.
  await page.goto('/#/for-programs/anthropic-fellows');
  await expect(page.getByTestId('packet')).toContainText('Talia Nwosu-Berg (sample)');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download as spreadsheet/ }).click()]);
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.split('\n')[0]).toContain('Why are you interested in participating in the Fellows program?');
  expect(csv).toContain('Talia Nwosu-Berg (sample)');
});

test('resources point to the official application forms', async ({ page }) => {
  await page.goto('/#/resources');
  const deadlines = page.getByRole('region', { name: 'Deadlines and official links' });
  await expect(deadlines.getByRole('row', { name: /Anthropic Fellows/ }).getByRole('link', { name: /Official application/ })).toHaveAttribute(
    'href',
    'https://airtable.com/appCHLjgoTUCJMLct/pagUhpiBE5KxoU3lX/form',
  );
  await expect(page.getByRole('heading', { name: 'Interviews and tests' })).toBeVisible();
});
