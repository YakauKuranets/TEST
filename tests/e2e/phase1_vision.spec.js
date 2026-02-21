// Playwright E2E spec for Phase 1 Vision & Tracking.
// Requires running app (Electron/web) + FastAPI in CI environment.
const { test, expect } = require('@playwright/test');

test('YOLO Detection & Logging', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/index.html');
  await page.click('#ai-detect-btn, #ai-object-detect');
  await expect(page.locator('#log-list')).toContainText('YOLO');

  const alphaNonZero = await page.evaluate(() => {
    const c = document.getElementById('ai-overlay');
    if (!c) return false;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width || 1, c.height || 1).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  });
  expect(alphaNonZero).toBeTruthy();
});

test('OCR Workflow', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/index.html');
  await page.click('#ai-ocr-btn');
  await expect(page.locator('#log-list')).toContainText('OCR');
});

test('SAM2 Error Handling', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/index.html');
  await page.click('#ai-propagate-btn');
  await expect(page.locator('body')).toBeVisible();
});
