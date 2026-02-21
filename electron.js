/**
 * PLAYE Studio Pro v3.0 — Electron Main Process
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const axios = require('axios');

let mainWindow;
let pythonProcess;
let backendPort = 8000;

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const backendPath = isDev
  ? path.join(__dirname, 'backend')
  : path.join(process.resourcesPath, 'backend');

const PLAYE_ROOT = 'D:\\PLAYE';
const PYTHON_PATH = 'D:\\PLAYE\\venv\\Scripts\\python.exe';
const MODELS_DIR = path.join(PLAYE_ROOT, 'models');
const CACHE_DIR = path.join(PLAYE_ROOT, '.cache');
const TEMP_DIR = path.join(PLAYE_ROOT, 'temp');


const downloadQueue = [];
let isDownloading = false;

function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function processDownloadQueue() {
  if (isDownloading) return;
  isDownloading = true;
  try {
    while (downloadQueue.length) {
      const task = downloadQueue.shift();
      const { id, url, filename } = task;
      const destination = path.join(MODELS_DIR, filename || `${id}.bin`);
      const tempDestination = `${destination}.download`;
      if (fs.existsSync(tempDestination)) fs.unlinkSync(tempDestination);
      const writer = fs.createWriteStream(tempDestination);
      const startedAt = Date.now();

      try {
        const response = await axios({ method: 'get', url, responseType: 'stream' });
        const total = Number(response.headers['content-length'] || 0);
        let downloaded = 0;

        response.data.on('data', (chunk) => {
          downloaded += chunk.length;
          const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);
          const speed = downloaded / elapsed;
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          emit('download-progress', { id, percent, speed });
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
          response.data.on('error', reject);
        });

        fs.renameSync(tempDestination, destination);
        emit('download-progress', { id, percent: 100, speed: 0 });
        emit('model-status-changed', { id, installed: true });
      } catch (err) {
        if (fs.existsSync(tempDestination)) fs.unlinkSync(tempDestination);
        emit('download-progress', { id, percent: 0, speed: 0, error: err.message });
      }
    }
  } finally {
    isDownloading = false;
  }
}

function findFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function validateBackendPortHandshake(port) {
  try {
    const cmd = process.platform === 'win32'
      ? `netstat -ano | findstr :${port}`
      : `netstat -an | grep :${port}`;
    const out = execSync(cmd, { encoding: 'utf8' });
    const hasListen = /LISTEN/i.test(out) || new RegExp(`127\\.0\\.0\\.1:${port}`).test(out);
    if (hasListen) console.log(`[Main] Port handshake OK: :${port}`);
    else console.warn(`[Main] Port handshake warning: no LISTEN socket for :${port}`);
  } catch (err) {
    console.warn(`[Main] Port handshake check skipped for :${port}: ${err.message}`);
  }
}

async function startPythonBackend() {
  backendPort = await findFreePort();
  const pythonPath = PYTHON_PATH;

  console.log(`[Main] Starting backend on port ${backendPort}...`);
  console.log(`[Main] Python: ${pythonPath}`);
  console.log(`[Main] Backend dir: ${backendPath}`);

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

    const onBackendOutput = (chunk) => {
      const line = chunk.toString();
      console.log(`[Python] ${line.trim()}`);
      if (line.includes('Uvicorn running') || line.includes('Application startup complete')) {
        validateBackendPortHandshake(backendPort);
        resolve();
      }
    };

    pythonProcess.stdout.on('data', onBackendOutput);
    pythonProcess.stderr.on('data', onBackendOutput);

    pythonProcess.on('error', (err) => {
      reject(new Error(`Python не найден: ${pythonPath}\n\n${err.message}`));
    });

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
      contextIsolation: true,
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
ipcMain.handle('open-folder', async (_event, folderPath) => shell.openPath(folderPath || MODELS_DIR));


ipcMain.handle('download-model', async (_event, payload = {}) => {
  const id = String(payload.id || payload.model || '');
  const url = String(payload.url || '');
  const filename = String(payload.filename || `${id}.bin`);
  if (!id || !url) throw new Error('id and url are required');
  downloadQueue.push({ id, url, filename });
  processDownloadQueue().catch((err) => {
    emit('download-progress', { id, percent: 0, speed: 0, error: err.message });
  });
  return { status: 'queued', id };
});

ipcMain.handle('download-models-all', async (_event, payload = {}) => {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  for (const task of tasks) {
    const id = String(task.id || '');
    const url = String(task.url || '');
    const filename = String(task.file || task.filename || `${id}.bin`);
    if (!id || !url) continue;
    downloadQueue.push({ id, url, filename });
  }
  processDownloadQueue().catch((err) => emit('download-progress', { id: 'queue', percent: 0, speed: 0, error: err.message }));
  return { status: 'queued', count: tasks.length };
});

app.whenReady().then(async () => {
  try {
    await startPythonBackend();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('PLAYE Studio — Ошибка запуска', `${err.message}\n\nЗапустите install.ps1 и повторите попытку.`);
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


ipcMain.handle('delete-model', async (_event, payload = {}) => {
  const id = String(payload.id || '');
  const file = String(payload.file || '');
  if (!id || !file) throw new Error('id and file are required');
  const destination = path.join(MODELS_DIR, file);
  if (fs.existsSync(destination)) fs.unlinkSync(destination);
  emit('model-status-changed', { id, installed: false });
  return { status: 'deleted', id };
});
