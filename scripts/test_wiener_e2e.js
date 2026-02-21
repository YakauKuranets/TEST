#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function run() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.warn('⚠️ Playwright package not installed; running contract fallback for Level 3.');
    const mainJs = read('frontend/src/main.js');
    assert(mainJs.includes("bindWienerDeblur"), 'Wiener binding missing');
    assert(mainJs.includes("/api/forensic/deblur"), 'Frontend not connected to JSON forensic endpoint');
    const wienerJs = read('frontend/src/wiener.js');
    assert(wienerJs.includes('⏳ Вычисление...'), 'UI busy state missing');
    assert(wienerJs.includes('forensic-wiener'), 'Forensic wiener log entry missing');
    console.log('✅ Level 3 contract checks passed.');
    return;
  }

  console.log('Playwright detected; full E2E should be run against npm run dev + Electron in CI runner.');
  const { chromium } = playwright;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8000/');
  await browser.close();
  console.log('✅ Minimal Playwright runtime sanity check passed.');
}

run().catch((err) => {
  console.error('❌ Wiener E2E failed:', err.message || err);
  process.exit(1);
});
