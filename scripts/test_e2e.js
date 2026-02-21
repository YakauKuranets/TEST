#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

async function testManifestAndStatusContracts() {
  const modelsCfg = read('backend/app/core/models_config.py');
  assert(modelsCfg.includes('MODELS_MANIFEST'), 'MODELS_MANIFEST missing');
  const ids = [...modelsCfg.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(ids.length >= 16, `Expected 16+ models, got ${ids.length}`);

  const routes = read('backend/app/api/system_routes.py');
  assert(routes.includes('@router.get("/models-config")'), '/models-config endpoint missing');
  assert(routes.includes('@router.get("/models-status")'), '/models-status endpoint missing');
  assert(routes.includes('os.path.exists'), 'models-status should use os.path.exists');
  console.log('[e2e] Step1 manifest/status contract OK');
}

async function testDownloadEngineContract() {
  const electronMain = read('electron.js');
  assert(electronMain.includes('downloadQueue'), 'downloadQueue missing');
  assert(electronMain.includes('.download'), 'temporary .download file handling missing');
  assert(electronMain.includes("send('download-progress'") || electronMain.includes("emit('download-progress'"), 'download-progress IPC missing');
  assert(electronMain.includes('{ id, percent, speed }') || electronMain.includes('id, percent, speed'), 'download-progress should contain id, percent, speed');
  assert(electronMain.includes("'download-models-all'"), 'bulk queue handler missing');
  console.log('[e2e] Step2 download queue contract OK');
}

async function testUiBindingsAndLocks() {
  const html = read('frontend/index.html');
  const ids = [...html.matchAll(/id="([^"]+)"[^>]*data-requires-model="([^"]+)"/g)].map((m) => ({ id: m[1], model: m[2] }));
  assert(ids.length > 0, 'No data-requires-model controls found');

  const jsBundle = [
    read('frontend/src/main.js'),
    read('frontend/src/blueprints/ai.js'),
    read('frontend/src/blueprints/aiHub.js'),
    read('frontend/src/blueprints/forensic.js'),
  ].join('\n');

  for (const item of ids) {
    assert(jsBundle.includes(item.id), `Missing JS references for control #${item.id}`);
  }

  const aiHub = read('frontend/src/blueprints/aiHub.js');
  assert(aiHub.includes('Модуль не установлен. Перейдите в настройки'), 'Missing lock warning message');
  assert(aiHub.includes('btn.disabled = true'), 'Lock disable logic missing');
  console.log('[e2e] Step3 UI lock bindings contract OK');
}

async function testForensicPipelineContracts() {
  const mainJs = read('frontend/src/main.js');
  const routes = read('backend/app/api/routes.py');
  assert(mainJs.includes('AbortController'), 'Timeout abort handling missing in frontend');
  assert(mainJs.includes('image_base64'), 'Frontend should handle image_base64 deblur response');
  assert(routes.includes('image_base64'), 'Backend deblur should return image_base64');
  console.log('[e2e] Step4 forensic pipeline contract OK');
}

async function runValidationProtocol() {
  await testManifestAndStatusContracts();
  await testDownloadEngineContract();
  await testUiBindingsAndLocks();
  await testForensicPipelineContracts();
  console.log('✅ ВСЕ СИСТЕМЫ В НОРМЕ (contract-level checks)');
}

runValidationProtocol().catch((err) => {
  console.error('❌ E2E protocol failed:', err.message || err);
  process.exit(1);
});
