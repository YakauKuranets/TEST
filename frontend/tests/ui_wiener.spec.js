import test from 'node:test';
import assert from 'node:assert/strict';

import { bindWienerDeblur } from '../src/wiener.js';

class El {
  constructor() {
    this.value = '0';
    this.disabled = false;
    this.innerText = 'Убрать смаз';
    this.listeners = {};
    this.style = {};
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
}

const makeCanvas = () => {
  const calls = { drawImage: 0 };
  const canvas = new El();
  canvas.width = 40;
  canvas.height = 20;
  canvas.getContext = () => ({ drawImage() { calls.drawImage += 1; } });
  canvas.toDataURL = () => 'data:image/png;base64,zzz';
  return { canvas, calls };
};

function setup() {
  const blurFixBtn = new El();
  const blurFixSlider = new El();
  const blurFixAngle = new El();
  const { canvas: photoCanvas, calls } = makeCanvas();

  global.Image = class {
    set src(_val) {
      this.naturalWidth = 40;
      this.naturalHeight = 20;
      setTimeout(() => this.onload?.(), 0);
    }
  };

  const requests = [];
  let resolveApi;
  const api = {
    applyWienerDeblur: (...args) => {
      requests.push(args);
      return new Promise((resolve) => {
        resolveApi = () => resolve('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZzN4AAAAASUVORK5CYII=');
      });
    },
  };

  const logs = [];
  const actions = {
    recordLog: (_type, msg) => logs.push(msg),
    showToast: (msg) => logs.push(`toast:${msg}`),
  };

  const state = { originalPhotoBase64: 'AAAA' };
  const elements = { blurFixBtn, blurFixSlider, blurFixAngle, photoCanvas };
  bindWienerDeblur({ elements, state, actions, api });

  return { blurFixBtn, blurFixSlider, blurFixAngle, requests, resolveApi: () => resolveApi?.(), calls, logs };
}

test('Wiener sliders are passed as numeric length/angle', async () => {
  const fx = setup();
  fx.blurFixSlider.value = '20';
  fx.blurFixAngle.value = '90';

  const promise = fx.blurFixBtn.listeners.click({ currentTarget: fx.blurFixBtn });
  fx.resolveApi();
  await promise;

  assert.equal(fx.requests.length, 1);
  assert.deepEqual(fx.requests[0], ['AAAA', 20, 90]);
});

test('Button gets disabled during processing', async () => {
  const fx = setup();
  fx.blurFixSlider.value = '18';
  fx.blurFixAngle.value = '15';

  const promise = fx.blurFixBtn.listeners.click({ currentTarget: fx.blurFixBtn });
  assert.equal(fx.blurFixBtn.disabled, true);
  assert.equal(fx.blurFixBtn.innerText, '⏳ Вычисление...');

  fx.resolveApi();
  await promise;

  assert.equal(fx.blurFixBtn.disabled, false);
});

test('Result base64 renders to canvas via drawImage', async () => {
  const fx = setup();
  const promise = fx.blurFixBtn.listeners.click({ currentTarget: fx.blurFixBtn });
  fx.resolveApi();
  await promise;

  assert.equal(fx.calls.drawImage > 0, true);
});
