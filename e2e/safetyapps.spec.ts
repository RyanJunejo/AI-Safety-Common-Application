import { expect, test } from '@playwright/test';

// The build under test has no Supabase settings, so it shows the bundled Oct 9, 2026
// catalog snapshot. Pin the clock to that day so statuses are stable.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-09T12:00:00Z'));
});

test('a visitor finds a program, saves it, and finds it again after a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Find your next step.' })).toBeVisible();
  await expect(page.getByText('Preview.')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search opportunities' }).fill('iliad');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/explore\?q=iliad$/);

  await page.getByRole('link', { name: 'Iliad Fellowship: January 2027' }).click();
  await expect(page).toHaveURL(/\/opportunities\/training-rec49VTc9xWkCdxwB$/);
  await expect(page.getByText('Nov 16, 2026, as published')).toBeVisible();
  await expect(page.getByTestId('prep-notes')).toContainText('checked Sep 25, 2026');
  await page.getByRole('button', { name: 'Save: Iliad Fellowship: January 2027' }).click();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Saved: Iliad Fellowship: January 2027' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Saved (1)' }).click();
  await expect(page.getByTestId('card-training-rec49VTc9xWkCdxwB')).toBeVisible();
});

test('filters live in the URL, so a filtered list can be shared', async ({ page }) => {
  await page.goto('/programs?focus=governance&country=UK');
  await expect(page.getByRole('checkbox', { name: 'Governance' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Country' })).toHaveValue('UK');
  const count = await page.getByTestId('result-count').textContent();
  expect(Number.parseInt(count!, 10)).toBeGreaterThan(0);

  await page.getByRole('link', { name: 'Jobs', exact: true }).first().click();
  await expect(page.getByRole('checkbox', { name: 'Technical' })).toBeDisabled();
});

test('old Common App links land on the new pages', async ({ page }) => {
  await page.goto('/#/programs/mats');
  await expect(page).toHaveURL(/\/opportunities\/training-receOAca5S5nHnSpU$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('MATS (Machine Alignment, Transparency, and Security)');

  await page.goto('/#/application/profile');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/#/resources');
  await expect(page).toHaveURL(/\/guides$/);
  await expect(page.getByRole('heading', { name: 'Interviews and tests' })).toBeVisible();
});

test('deep links work on a fresh load', async ({ page }) => {
  const res = await page.goto('/communities');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Communities' })).toBeVisible();
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'What we store when you sign in' })).toBeVisible();
});
