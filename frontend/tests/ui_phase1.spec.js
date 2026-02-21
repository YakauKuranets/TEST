import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('frontend/index.html', 'utf8');
const main = fs.readFileSync('frontend/src/main.js', 'utf8');

test('Layered canvas prerequisites are present', () => {
  assert.ok(html.includes('id="pro-canvas"'));
  assert.ok(html.includes('id="ai-overlay"'));
});

test('YOLO detect binding + forensic log are wired', () => {
  assert.ok(main.includes("/api/ai/detect"));
  assert.ok(main.includes('YOLO: Найдено'));
});

test('OCR UI and UTF-8 log format are wired', () => {
  assert.ok(html.includes('id="ai-ocr-btn"'));
  assert.ok(main.includes('Распознан текст'));
});

test('Track cleanup contract is wired in frontend', () => {
  assert.ok(main.includes('/api/ai/track-cleanup/'));
});
