#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const main = read('frontend/src/main.js');
assert(main.includes('/api/ai/detect'), 'detect endpoint not wired');
assert(main.includes('YOLO: Найдено'), 'YOLO log missing');
assert(main.includes('/api/ai/ocr'), 'ocr endpoint not wired');
assert(main.includes('Распознан текст'), 'OCR log missing');
assert(main.includes('/api/ai/face-restore'), 'face-restore endpoint not wired');
assert(main.includes('/api/ai/track-init'), 'track-init endpoint not wired');
assert(main.includes('/api/ai/track-propagate'), 'track-propagate endpoint not wired');
assert(main.includes('/api/ai/track-cleanup/'), 'track-cleanup endpoint not wired');

const routes = read('backend/app/api/routes.py');
for (const route of ['/ai/detect', '/ai/ocr', '/ai/face-restore', '/ai/track-init', '/ai/track-add-prompt', '/ai/track-propagate', '/ai/track-mask/{track_id}/{frame_num}', '/ai/track-cleanup/{track_id}']) {
  assert(routes.includes(route), `missing backend route ${route}`);
}

console.log('✅ Phase1 E2E contract checks passed.');
