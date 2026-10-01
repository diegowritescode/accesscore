import { expect, test } from '@playwright/test';
test('switches the console to Spanish and keeps it across pages', async ({ page }) => {
  await page.goto('/console');

  await page.getByRole('button', { name: 'ES' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();

  await page.goto('/console/playground');
  await expect(
    page.getByRole('navigation').getByRole('link', { name: 'Relaciones' }),
  ).toBeVisible();
});
