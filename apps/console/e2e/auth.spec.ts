import { expect, test } from '@playwright/test';
import { DEMO_EMAIL, NO_SESSION, signInAsDemo } from './session';

test('shows the signed-in demo account on the overview @smoke', async ({ page }) => {
  await page.goto('/console');

  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(DEMO_EMAIL);
  await expect(page.getByRole('banner')).toContainText('AAL 1');
});

test.describe('without a session', () => {
  test.use({ storageState: NO_SESSION });

  test('sends an anonymous visitor to the login page @smoke', async ({ page }) => {
    await page.goto('/console/playground');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to the Console' })).toBeVisible();
  });

  test('rejects unknown credentials without starting a session', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole('textbox', { name: 'Password' }).fill('not the password at all');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'Invalid credentials' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs out and closes the console', async ({ page }) => {
    await signInAsDemo(page);

    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/console');
    await expect(page).toHaveURL(/\/login$/);
  });
});
