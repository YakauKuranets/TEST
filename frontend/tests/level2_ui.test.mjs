import test from 'node:test';
import assert from 'node:assert/strict';

import { createAiHubBlueprint } from '../src/blueprints/aiHub.js';
import { createPhotoBlueprint } from '../src/blueprints/photo.js';

class ClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach((n) => this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  toggle(name, force) { if (force) this.set.add(name); else this.set.delete(name); }
  contains(name) { return this.set.has(name); }
}

class El {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.textContent = '';
    this.classList = new ClassList();
    this.listeners = {};
  }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  removeEventListener(name) { delete this.listeners[name]; }
  click() { this.listeners.click?.({ preventDefault() {}, stopImmediatePropagation() {} }); }
  getAttribute(name) { return name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : undefined; }
}

function setupDom() {
  const byId = new Map();
  const tabs = [new El(), new El(), new El()];
  tabs[0].dataset.settingsTab = 'models';
  tabs[1].dataset.settingsTab = 'paths';
  tabs[2].dataset.settingsTab = 'system';
  const panels = [new El(), new El(), new El()];
  panels[0].dataset.settingsPanel = 'models';
  panels[1].dataset.settingsPanel = 'paths';
  panels[2].dataset.settingsPanel = 'system';

  const blurBtn = new El('ai-blur-fix-btn'); blurBtn.dataset.requiresModel = 'nafnet';
  const srBtn = new El('ai-sr-apply'); srBtn.dataset.requiresModel = 'realesrgan'; srBtn.textContent = 'SR';
  const progress = new El(); progress.classList.add('progress-fill');

  ['ai-hub-models', 'check-model-updates', 'model-updates-status', 'download-all-models', 'workspace-settings-btn', 'launcher-settings-btn', 'vram-monitor-container'].forEach((id) => byId.set(id, new El(id)));

  global.document = {
    body: new El('body'),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (sel) => (sel === '.progress-fill' ? progress : null),
    querySelectorAll: (sel) => {
      if (sel === '.settings-tab') return tabs;
      if (sel === '.settings-panel') return panels;
      if (sel === '[data-requires-model]') return [blurBtn, srBtn];
      return [];
    },
    createElement: () => new El(),
  };

  global.window = {
    API_PORT: 8000,
    electronAPI: {
      checkModels: async () => ({ nafnet: false, realesrgan: true }),
      onDownloadProgress: (fn) => { global.__dl = fn; },
      onModelStatusChanged: () => {},
    },
  };
  global.fetch = async (url) => ({ ok: true, json: async () => (url.includes('models-config') ? {} : {}) });
  global.EventSource = class { constructor() {} close() {} };

  return { tabs, panels, blurBtn, srBtn, progress };
}

test('DOM tabs switch active classes and lock logic works', async () => {
  const { tabs, panels, blurBtn, srBtn } = setupDom();
  createAiHubBlueprint().init({ elements: { settingsBtn: new El('workspace-settings-btn') } });
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(tabs[0].classList.contains('active'), true);
  assert.equal(panels[0].classList.contains('active'), true);
  assert.equal(blurBtn.classList.contains('is-locked'), true);
  assert.equal(srBtn.disabled, false);
});

test('IPC download-progress updates .progress-fill width', async () => {
  const { progress } = setupDom();
  createAiHubBlueprint().init({ elements: { settingsBtn: new El('workspace-settings-btn') } });
  global.__dl({ id: 'sam2', percent: 65, speed: 1 });
  assert.equal(progress.style.width, '65%');
});

test('Photo pipeline draws image and keeps finite aspect ratio', async () => {
  const input = new El('photo-source-input');
  input.files = [{ name: 'test.png' }];
  const status = new El('photo-status');
  const blend = new El('photo-recon');
  const drawCalls = { count: 0 };
  const canvas = new El('photo-canvas');
  canvas.getContext = () => ({ clearRect() {}, drawImage() { drawCalls.count += 1; } });

  global.FileReader = class {
    readAsDataURL() { this.result = 'data:image/png;base64,AA=='; this.onload?.(); }
  };
  global.Image = class {
    set src(_) { this.naturalWidth = 40; this.naturalHeight = 20; this.onload?.(); }
  };

  createPhotoBlueprint().init({
    elements: { photoSourceInput: input, photoBlendButton: blend, photoCanvas: canvas, photoStatus: status },
    actions: { recordLog() {} },
    state: {},
  });

  await input.listeners.change();
  assert.equal(drawCalls.count > 0, true);
  const ratio = canvas.width / canvas.height;
  assert.equal(Number.isFinite(ratio), true);
});
