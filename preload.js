const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let mainWindow;
let pythonProcess;
let backendPort = 8000;

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const backendPath = isDev ? path.join(__dirname, 'backend') : path.join(process.resourcesPath, 'backend');

function findFreePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startPythonBackend() {
  backendPort = await findFreePort();
  const pythonPath = 'D:\\PLAYE\\venv\\Scripts\\python.exe';
  const modelsDir = 'D:\\PLAYE\\models';

  console.log(`[Main] Starting Python backend on port ${backendPort}...`);

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

    pythonProcess = spawn(pythonPath, [
      '-u', '-m', 'uvicorn', 'app.main:app',
      '--host', '127.0.0.1', '--port', backendPort.toString()
    ], {
      cwd: backendPath,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PLAYE_MODELS_DIR: modelsDir, API_PORT: backendPort.toString() }
    });

    const checkOutput = (data) => {
      const out = data.toString();
      console.log(`[Python] ${out.trim()}`);
      if (out.includes('Uvicorn running') || out.includes('Application startup complete')) resolve();
    };

    pythonProcess.stdout.on('data', checkOutput);
    pythonProcess.stderr.on('data', checkOutput);
    pythonProcess.on('error', (err) => reject(err));
    setTimeout(() => reject(new Error('Backend timeout (120s)')), 120000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    backgroundColor: '#08090c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true, // Включено для стабильности preload.js
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`window.API_PORT = ${backendPort};`);
  });
  if (isDev) mainWindow.webContents.openDevTools();
}

ipcMain.handle('get-api-url', () => `http://127.0.0.1:${backendPort}/api`);
ipcMain.handle('open-folder', (e, p) => shell.openPath(p || 'D:\\PLAYE\\models'));

app.whenReady().then(async () => {
  try { await startPythonBackend(); createWindow(); }
  catch (err) { dialog.showErrorBox('Ошибка', err.message); app.quit(); }
});

app.on('will-quit', () => { if (pythonProcess) pythonProcess.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });