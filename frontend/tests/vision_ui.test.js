import test from 'node:test';
import assert from 'node:assert/strict';

import { applyModelLock, drawBoundingBoxes, scaleCanvasCoordinates, withLoadingState } from '../src/vision-ui.js';

class Btn {
  constructor(text = '🔍 Объекты') {
    this.textContent = text;
    this.disabled = false;
    this.dataset = {};
  }
}

test('Test_Button_Lock: yolov10 unavailable locks detect button', () => {
  const btn = new Btn('🔍 Объекты');
  applyModelLock(btn, false);
  assert.equal(btn.disabled, true);
  assert.equal(btn.textContent.includes('🔒'), true);
});

test('Test_Loading_State: face button disabled while pending', async () => {
  const btn = new Btn('👤 Лица');
  let release;
  const promise = withLoadingState(btn, () => new Promise((resolve) => { release = resolve; }), 'Обработка...');
  assert.equal(btn.disabled, true);
  assert.equal(btn.textContent, 'Обработка...');
  release('ok');
  await promise;
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, '👤 Лица');
});

test('Test_Bounding_Box_Draw: clears and draws box', () => {
  const calls = [];
  const ctx = {
    clearRect: (...a) => calls.push(['clearRect', ...a]),
    set strokeStyle(v) { calls.push(['strokeStyle', v]); },
    set lineWidth(v) { calls.push(['lineWidth', v]); },
    set font(v) { calls.push(['font', v]); },
    strokeRect: (...a) => calls.push(['strokeRect', ...a]),
    fillText: (...a) => calls.push(['fillText', ...a]),
  };
  const canvas = { width: 800, height: 450, getContext: () => ctx };
  drawBoundingBoxes(canvas, [{ class: 'car', conf: 0.9, bbox: [10, 10, 50, 50] }]);

  assert.equal(calls.some((c) => c[0] === 'clearRect'), true);
  assert.equal(calls.some((c) => c[0] === 'strokeStyle'), true);
  assert.equal(calls.some((c) => c[0] === 'strokeRect' && c[1] === 10 && c[2] === 10 && c[3] === 40 && c[4] === 40), true);
});

test('Test_Coordinate_Scaling: DOM 800x450 to internal 1920x1080', () => {
  const [x, y] = scaleCanvasCoordinates(
    { clientX: 400, clientY: 225 },
    { left: 0, top: 0, width: 800, height: 450 },
    { width: 1920, height: 1080 },
  );
  assert.equal(x, 960);
  assert.equal(y, 540);
});
