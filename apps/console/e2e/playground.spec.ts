import { expect, type Page, test } from '@playwright/test';
async function openPlayground(page: Page): Promise<void> {
  await page.goto('/console/playground');
  await expect(page.getByRole('heading', { level: 1, name: 'Playground' })).toBeVisible();
}

async function decision(page: Page): Promise<string> {
  const outcome = page.getByRole('main').getByText(/^(PERMIT|DENY)$/);
  await expect(outcome).toBeVisible();
  return (await outcome.textContent()) ?? '';
}

async function ownerSubject(page: Page): Promise<string> {
  const owner = page
    .getByRole('combobox', { name: /^Subject/ })
    .locator('option')
    .filter({ hasText: /^user:[0-9a-f-]{36}$/ });
  await expect(owner).toHaveCount(1);
  return (await owner.textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

test('permits a member of a nested group to read the document @smoke', async ({ page }) => {
  await page.getByRole('combobox', { name: /^Subject/ }).selectOption('user:bob');
  await page.getByRole('combobox', { name: /^Action/ }).selectOption('read');
  await page.getByRole('button', { name: 'Check' }).click();

  expect(await decision(page)).toBe('PERMIT');
});

test('denies by default when no relationship reaches the resource @smoke', async ({ page }) => {
  await page.getByRole('combobox', { name: /^Subject/ }).selectOption('user:bob');
  await page.getByRole('combobox', { name: 'Resource type' }).selectOption('ledger');
  await page.getByRole('combobox', { name: /^Resource id/ }).selectOption('miniledger');
  await page.getByRole('combobox', { name: /^Action/ }).selectOption('audit');
  await page.getByRole('button', { name: 'Check' }).click();

  expect(await decision(page)).toBe('DENY');
  await expect(page.getByRole('main').getByRole('code')).toContainText(['default_deny']);
});

test('lets the owner write only after step-up to AAL 2 @smoke', async ({ page }) => {
  await page.getByRole('combobox', { name: /^Subject/ }).selectOption(await ownerSubject(page));
  await page.getByRole('combobox', { name: /^Action/ }).selectOption('write');

  await page.getByRole('combobox', { name: /^Assurance/ }).selectOption({ label: '1 — password' });
  await page.getByRole('button', { name: 'Check' }).click();
  expect(await decision(page)).toBe('DENY');
  await expect(page.getByRole('main').getByRole('code')).toContainText(['forbid_matched']);

  await page.getByRole('combobox', { name: /^Assurance/ }).selectOption({ label: '2 — MFA' });
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('main').getByText('PERMIT', { exact: true })).toBeVisible();
});

test('enforces the same policy on the signed-in session @smoke', async ({ page }) => {
  await page.getByRole('tab', { name: 'Me' }).click();
  await page.getByRole('combobox', { name: /^Action/ }).selectOption('write');
  await page.getByRole('button', { name: 'Check' }).click();

  expect(await decision(page)).toBe('DENY');
});

test('expands the viewer relation to every subject that can read @smoke', async ({ page }) => {
  await page.getByRole('tab', { name: /^Expand/ }).click();
  await page.getByRole('combobox', { name: 'Relation' }).selectOption('viewer');
  await page.getByRole('button', { name: 'Expand', exact: true }).click();

  const closure = page.getByRole('main').getByRole('listitem');
  await expect(closure.filter({ hasText: 'user:bob' })).toBeVisible();
  await expect(closure.filter({ hasText: 'user:carol' })).toBeVisible();
  await expect(closure.filter({ hasText: /^user:[0-9a-f-]{36}$/ })).toBeVisible();
});
