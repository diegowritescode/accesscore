import { expect, type Page } from '@playwright/test';

export const DEMO_EMAIL = 'demo@accesscore.dev';
export const DEMO_SESSION = 'playwright/.auth/demo.json';
export const NO_SESSION = { cookies: [], origins: [] };

export async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/console$/);
}
