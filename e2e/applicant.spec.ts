import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Round status depends on the date; pin it to the day the sources were verified.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-25T12:00:00Z'));
});

test('an applicant compares, rules out, reuses, saves, reloads, and exports', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Compare programs' })).toBeVisible();

  // Compare: three rounds are open; every other program reads as closed.
  const openBadges = page.locator('[data-testid^="round-"][data-state="open"]');
  await expect(openBadges).toHaveCount(3);
  await expect(page.getByTestId('round-lasr')).toHaveAttribute('data-state', 'closed');

  // Rule out a closed round and a location conflict.
  await page.getByTestId('program-lasr').getByRole('button', { name: 'Rule out: closed round' }).click();
  await expect(page.getByTestId('program-lasr')).toContainText('Round closed: deadline passed sep 20, 2026');
  const pibbss = page.getByTestId('program-pibbss');
  await expect(pibbss).toContainText('Location conflict');
  await pibbss.getByLabel('Your status').selectOption('ruled-out');
  await expect(pibbss).toContainText('Round closed');

  // Reuse a work artifact on an open program.
  await page.getByTestId('program-anthropic-fellows').getByRole('link', { name: 'Prepare' }).click();
  await expect(page.getByRole('heading', { name: 'Anthropic Fellows', level: 1 })).toBeVisible();
  const workLinks = page.getByTestId('q-anthropic-fellows-work-links');
  await workLinks.getByLabel(/probe-drift/).check();
  await expect(workLinks).toHaveClass(/done/);

  // Identify required original answers on another open program.
  await page.goto('/#/program/iliad');
  const original = page.getByTestId('section-original');
  await expect(original).toContainText('two most difficult mathematical concepts');
  await expect(original.getByText('Exact prompt')).toBeVisible();
  const draft = page.getByTestId('q-iliad-difficult-math-concepts').getByLabel(/working draft/);
  await draft.fill('Measure-theoretic probability, because');
  await page.getByTestId('q-iliad-difficult-math-concepts').getByLabel('Progress').selectOption('drafted');
  await expect(page.getByTestId('save-state')).toContainText('Saved in this browser');

  // Refresh: everything is still there.
  await page.reload();
  await expect(page.getByTestId('q-iliad-difficult-math-concepts').getByLabel(/working draft/)).toHaveValue(
    'Measure-theoretic probability, because',
  );
  await page.goto('/#/program/anthropic-fellows');
  await expect(page.getByTestId('q-anthropic-fellows-work-links')).toHaveClass(/done/);
  await page.goto('/#/programs');
  await expect(page.getByTestId('program-lasr')).toContainText('Round closed');

  // Export the checklist.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export checklist' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^application-checklist-\d{4}-\d{2}-\d{2}\.md$/);
  const md = await readFile((await download.path())!, 'utf8');
  expect(md).toContain('## Anthropic Fellows');
  expect(md).toContain('attached: probe-drift');
  expect(md).toContain('## Ruled out');
  expect(md).toContain('- LASR Labs — Round closed');
  expect(md).not.toContain('Measure-theoretic probability');
});

test('closed-form programs never show unpublished prompts as exact', async ({ page }) => {
  await page.goto('/#/program/pivotal');
  const unseen = page.getByTestId('not-yet-visible');
  await expect(unseen).toContainText('Prompt not published');
  await expect(page.locator('[data-visibility="verbatim"]')).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('This round is not accepting applications');
});

test.describe('status over time', () => {
  test('an open page closes IAPS when its deadline passes, while Iliad stays open for its later cohort', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-27T23:58:00-04:00') });
    await page.goto('/');
    await page.getByLabel('Open rounds only').check();
    await expect(page.getByTestId('program-iaps')).toBeVisible();

    await page.clock.fastForward('02:00');
    await expect(page.getByTestId('program-iaps')).toHaveCount(0);
    await expect(page.getByTestId('program-iliad')).toBeVisible();

    // Past the Intensive's Sep 28 deadline, the same form still takes Fellowship applications.
    await page.clock.fastForward(72 * 60 * 60 * 1000);
    await expect(page.getByTestId('round-iliad')).toContainText('Closes Oct 19, 2026 (Dec 2026 Fellowship)');
    await expect(page.getByTestId('program-iliad')).toBeVisible();
  });

  test('a stale rolling status reads as unverified, not closed', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
    await page.goto('/#/program/anthropic-fellows');
    await expect(page.getByTestId('round-anthropic-fellows')).toContainText('Recheck status');
    await expect(page.getByTestId('round-callout')).toContainText('Check the official page before applying');
    await expect(page.getByText('not accepting applications')).toHaveCount(0);
    await expect(page.getByText(/closed round/)).toHaveCount(0);
  });
});
