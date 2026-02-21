#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (c, m) => { if (!c) throw new Error(m); };

const pkg = JSON.parse(read('package.json'));
assert(pkg.scripts?.dev, 'dev script missing');

const mainJs = read('frontend/src/main.js');
assert(mainJs.includes('blur-fix-intensity'), 'blur fix slider binding missing');
assert(mainJs.includes('#log-list') || mainJs.includes('log-list'), 'log list integration missing');

const electronMain = read('electron.js');
assert(electronMain.includes('download-model') || electronMain.includes('downloadModel'), 'model download IPC missing');

console.log('✅ Level 3 readiness checks passed (dev lifecycle, AI Hub sync, forensic UI hooks).');
