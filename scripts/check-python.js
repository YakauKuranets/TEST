/*
 * Postinstall helper.
 * Detect Python (Strictly 3.12)
 */

const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
}

function detectPython() {
  const isWin = process.platform === 'win32';

  if (isWin) {
    // Строго ищем 3.12
    const py = run('py', ['-3.12', '--version']);
    if (py.status === 0) return { cmd: 'py', argsPrefix: ['-3.12'] };

    const python = run('python', ['--version']);
    if (python.status === 0) return { cmd: 'python', argsPrefix: [] };
  } else {
    const python312 = run('python3.12', ['--version']);
    if (python312.status === 0) return { cmd: 'python3.12', argsPrefix: [] };
    const python3 = run('python3', ['--version']);
    if (python3.status === 0) return { cmd: 'python3', argsPrefix: [] };
    const python = run('python', ['--version']);
    if (python.status === 0) return { cmd: 'python', argsPrefix: [] };
  }
  return null;
}

function printHelp() {
  console.error('\n[PLAYE] Python 3.12 не найден. Установи Python 3.12 и повтори установку.');
  console.error('Windows: https://www.python.org/downloads/windows/');
}

async function maybeSetupBackend(python) {
  if (process.env.PLAYE_SETUP_BACKEND !== '1') {
    console.log('[PLAYE] Backend setup skipped.');
    return;
  }
  console.log('[PLAYE] Setting up backend (venv + pip install)...');
  const setupPath = path.join(__dirname, 'setup-backend.js');
  const node = process.execPath;
  const r = spawnSync(node, [setupPath, python.cmd, ...python.argsPrefix], { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error('Backend setup failed.');
  }
}

async function main() {
  const python = detectPython();
  if (!python) {
    printHelp();
    process.exit(1);
  }
  const ver = run(python.cmd, [...python.argsPrefix, '--version']);
  console.log(`[PLAYE] Detected Python: ${ver.stdout.trim()}`);
  await maybeSetupBackend(python);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}