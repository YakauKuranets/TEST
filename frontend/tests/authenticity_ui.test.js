import test from 'node:test';
import assert from 'node:assert/strict';

import { applySplitClip, renderHeatmapOverlay } from '../src/split-view.js';

test('Test_Slider_Sync: value 25 -> inset(0 75% 0 0)', () => {
  const canvas = { style: {} };
  const clip = applySplitClip(canvas, 25);
  assert.equal(clip, 'inset(0 75% 0 0)');
  assert.equal(canvas.style.clipPath, 'inset(0 75% 0 0)');
});

test('Test_Slider_Boundaries: 0 and 100 without NaN', () => {
  const canvas = { style: {} };
  const c0 = applySplitClip(canvas, 0);
  const c100 = applySplitClip(canvas, 100);
  assert.equal(c0.includes('NaN'), false);
  assert.equal(c100.includes('NaN'), false);
  assert.equal(c0, 'inset(0 100% 0 0)');
  assert.equal(c100, 'inset(0 0% 0 0)');
});

test('Test_Heatmap_Render: sets composite mode before draw', async () => {
  const calls = [];
  const ctx = {
    _gco: 'source-over',
    get globalCompositeOperation() { return this._gco; },
    set globalCompositeOperation(v) { this._gco = v; calls.push(['gco', v]); },
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  const canvas = { width: 100, height: 50, getContext: () => ctx };

  global.Image = class {
    set src(_v) { setTimeout(() => this.onload?.(), 0); }
  };

  await renderHeatmapOverlay(canvas, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZzN4AAAAASUVORK5CYII=');
  assert.equal(calls.some((c) => c[0] === 'gco' && c[1] === 'screen'), true);
  assert.equal(calls.some((c) => c[0] === 'drawImage'), true);
});
