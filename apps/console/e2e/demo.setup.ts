import { test as setup } from '@playwright/test';
import { DEMO_SESSION, signInAsDemo } from './session';

setup('sign in once as the demo account @smoke', async ({ page }) => {
  await signInAsDemo(page);
  await page.context().storageState({ path: DEMO_SESSION });
});
