/**
 * PLAYE Studio Pro v3.0 — Electron Main Process
 *
 * Всё на D: (venv, models, cache, temp).
 * Динамический поиск Python: D:\PLAYE\venv → .venv → системный.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWindow;
let pythonProcess;
let backendPort = 8000;

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const backendPath = isDev
  ? path.join(__dirname, 'backend')
  : path.join(process.resourcesPath, 'backend');

// ═══ D: DRIVE PATHS ═══
const PLAYE_ROOT   = 'D:\\PLAYE';
const VENV_DIR     = path.join(PLAYE_ROOT, 'venv');
const MODELS_DIR   = path.join(PLAYE_ROOT, 'models');
const CACHE_DIR    = path.join(PLAYE_ROOT, '.cache');
const TEMP_DIR     = path.join(PLAYE_ROOT, 'temp');

function findFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Динамический поиск Python.
 * Приоритет: D:\PLAYE\venv → backend\.venv → py -3.12 → python
 */
function findPython() {
  const isWin = process.platform === 'win32';
  const ext = isWin ? 'Scripts\\python.exe' : 'bin/python';

  // 1. D:\PLAYE\venv (основной)
  const mainVenv = path.join(VENV_DIR, ext);
  if (fs.existsSync(mainVenv)) {
    console.log(`[Main] Python found: ${mainVenv}`);
    return mainVenv;
  }

  // 2. backend/.venv (симлинк или локальный)
  const localVenv = path.join(backendPath, '.venv', ext);
  if (fs.existsSync(localVenv)) {
    console.log(`[Main] Python found: ${localVenv}`);
    return localVenv;
  }

  // 3. py launcher (Windows)
  if (isWin) {
    try {
      const pyPath = execSync('py -3.12 -c "import sys; print(sys.executable)"', { encoding: 'utf8' }).trim();
      if (fs.existsSync(pyPath)) {
        console.log(`[Main] Python found via py launcher: ${pyPath}`);
        return pyPath;
      }
    } catch {}
  }

  // 4. Системный python/python3
  const fallback = isWin ? 'python' : 'python3';
  console.log(`[Main] Python fallback: ${fallback}`);
  return fallback;
}

async function startPythonBackend() {
  backendPort = await findFreePort();
  const pythonPath = findPython();

  console.log(`[Main] Starting backend on port ${backendPort}...`);
  console.log(`[Main] Python: ${pythonPath}`);
  console.log(`[Main] Backend dir: ${backendPath}`);
  console.log(`[Main] Models dir: ${MODELS_DIR}`);

  // Ensure D: directories exist
  for (const dir of [MODELS_DIR, CACHE_DIR, TEMP_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    pythonProcess = spawn(pythonPath, [
      '-u',
      '-m', 'uvicorn',
      'app.main:app',
      '--host', '127.0.0.1',
      '--port', backendPort.toString()
    ], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PLAYE_MODELS_DIR: MODELS_DIR,
        TORCH_HOME: path.join(CACHE_DIR, 'torch'),
        HF_HOME: path.join(CACHE_DIR, 'huggingface'),
        TRANSFORMERS_CACHE: path.join(CACHE_DIR, 'huggingface'),
        PIP_CACHE_DIR: path.join(CACHE_DIR, 'pip'),
        TEMP: TEMP_DIR,
        TMP: TEMP_DIR,
        API_PORT: backendPort.toString()
      }
    });

    pythonProcess.stdout.on('data', (data) => {
      const out = data.toString();
      console.log(`[Python] ${out.trim()}`);
      if (out.includes('Uvicorn running') || out.includes('Application startup complete')) {
        resolve();
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const errStr = data.toString();
      console.error(`[Python] ${errStr.trim()}`);
      if (errStr.includes('Uvicorn running') || errStr.includes('Application startup complete')) {
        resolve();
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('[Python Error]', err.message);
      reject(new Error(`Python не найден: ${pythonPath}\n\nУбедитесь что:\n1. Запущен install.ps1\n2. Python 3.12 установлен\n3. venv создан в D:\\PLAYE\\venv`));
    });

    // Timeout: 120s для CPU, GPU обычно быстрее
    setTimeout(() => reject(new Error('Backend timeout (120s). Проверьте D:\\PLAYE\\venv')), 120000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#08090c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`window.API_PORT = ${backendPort};`);
  });

  if (isDev) mainWindow.webContents.openDevTools();
}

ipcMain.handle('get-api-url', () => `http://127.0.0.1:${backendPort}/api`);

ipcMain.handle('open-folder', async (_event, folderPath) => {
  shell.openPath(folderPath || MODELS_DIR);
});

app.whenReady().then(async () => {
  try {
    await startPythonBackend();
    createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox(
      'PLAYE Studio — Ошибка запуска',
      err.message + '\n\nЗапустите install.ps1 и повторите попытку.'
    );
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
