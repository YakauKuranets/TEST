/**
 * Main process for PLAYE PhotoLab - Pro Desktop Edition
 * Управляет жизненным циклом Electron и монолитным Python-движком.
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWindow;
let pythonProcess;
let backendPort = 8000; // По умолчанию

// Определяем пути
const isDev = process.argv.includes('--dev') || !app.isPackaged;
const backendPath = isDev
  ? path.join(__dirname, 'backend')
  : path.join(process.resourcesPath, 'backend');

/**
 * Поиск свободного порта для бэкенда (чтобы избежать конфликтов)
 */
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
 * Запуск монолитного Python бэкенда
 */
async function startPythonBackend() {
  backendPort = await findFreePort();
  console.log(`[Main] Starting Python backend on port ${backendPort}...`);

  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';

    // Ищем интерпретатор (сначала venv, потом системный)
    let pyCmd = isWin ? 'python' : 'python3';
    const venvPath = path.join(backendPath, '.venv', isWin ? 'Scripts/python.exe' : 'bin/python');

    if (fs.existsSync(venvPath)) {
      pyCmd = venvPath;
    }

    // Запускаем main.py (теперь это наш единственный вход)
    const serverScript = path.join(backendPath, 'app', 'main.py');
    const modelsDir = path.join(app.getPath('userData'), 'models');

    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    pythonProcess = spawn(pyCmd, [
      '-u', // Unbuffered output
      '-m', 'uvicorn',
      'app.main:app',
      '--host', '127.0.0.1',
      '--port', backendPort.toString()
    ], {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        PLAYE_MODELS_DIR: modelsDir,
        API_PORT: backendPort.toString()
      }
    });

    pythonProcess.stdout.on('data', (data) => {
      const out = data.toString();
      console.log(`[Python] ${out}`);
      if (out.includes('Uvicorn running') || out.includes('Application startup complete')) {
        resolve();
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Python Error] ${data.toString()}`);
    });

    pythonProcess.on('error', (err) => {
      reject(err);
    });

    // Тайм-аут на запуск 20 секунд
    setTimeout(() => reject(new Error('Backend start timeout')), 20000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#08090c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true, // Включаем для доступа к path в Electron
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));

  // Передаем порт бэкенда во фронтенд
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`window.API_PORT = ${backendPort};`);
  });

  if (isDev) mainWindow.webContents.openDevTools();
}

// --- IPC HANDLERS ---

ipcMain.handle('get-api-url', () => `http://127.0.0.1:${backendPort}/api`);

ipcMain.handle('open-folder', async (event, folderPath) => {
  if (folderPath) shell.openPath(folderPath);
  else shell.openPath(path.join(app.getPath('userData'), 'models'));
});

// Жизненный цикл
app.whenReady().then(async () => {
  try {
    await startPythonBackend();
    createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    dialog.showErrorBox('Критическая ошибка', 'Не удалось запустить AI-движок: ' + err.message);
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) pythonProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});