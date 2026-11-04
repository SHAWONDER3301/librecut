'use strict';

const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const media = require('./media');
const exporter = require('./exporter');

// --- Privacidad: nada de red, nada de telemetría -------------------------
// Bloqueamos cualquier petición de red saliente del renderer. La app es 100%
// local; lo único que ejecuta binarios es FFmpeg, vía spawn controlado.
app.setPath('userData', path.join(app.getPath('appData'), 'LibreCut'));

let mainWindow = null;
let currentExport = null;

// Esquema privilegiado para servir ficheros locales al <video> con soporte
// de 'range' (necesario para hacer seek). Evita los problemas de file://.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, standard: true }
  }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#14141a',
    title: 'LibreCut',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  // media://f/?p=<ruta absoluta codificada>
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url);
      const p = url.searchParams.get('p');
      if (!p) return new Response('missing p', { status: 400 });
      const abs = decodeURIComponent(p);
      return net.fetch(pathToFileURL(abs).toString(), {
        headers: request.headers,
        method: request.method
      });
    } catch (err) {
      return new Response(String(err), { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC ------------------------------------------------------------------

ipcMain.handle('media:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar medios',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Medios', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
      { name: 'Vídeo', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg'] },
      { name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] },
      { name: 'Todos', extensions: ['*'] }
    ]
  });
  if (res.canceled) return [];
  return res.filePaths;
});

ipcMain.handle('media:probe', async (_evt, filePath) => {
  return media.probe(filePath);
});

ipcMain.handle('media:thumbnail', async (_evt, filePath, timeSec) => {
  return media.thumbnail(filePath, timeSec);
});

ipcMain.handle('media:silence', async (_evt, filePath, inPoint, span, noiseDb, minDur) => {
  return media.detectSilence(filePath, inPoint, span, noiseDb, minDur);
});

ipcMain.handle('media:waveform', async (_evt, filePath) => {
  return media.waveform(filePath);
});

ipcMain.handle('export:pickOutput', async (_evt, suggestedName) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar vídeo',
    defaultPath: suggestedName || 'librecut-export.mp4',
    filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }]
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('export:run', async (_evt, project, outputPath) => {
  if (currentExport) return { ok: false, error: 'Ya hay una exportación en curso.' };
  return new Promise((resolve) => {
    currentExport = exporter.run(project, outputPath, {
      onProgress: (pct, line) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('export:progress', { pct, line });
        }
      },
      onDone: (result) => {
        currentExport = null;
        resolve(result);
      }
    });
  });
});

ipcMain.handle('export:cancel', async () => {
  if (currentExport && currentExport.cancel) currentExport.cancel();
  currentExport = null;
  return { ok: true };
});

ipcMain.handle('project:save', async (_evt, project) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar proyecto',
    defaultPath: (project && project.name ? project.name : 'proyecto') + '.lcut',
    filters: [{ name: 'Proyecto LibreCut', extensions: ['lcut'] }]
  });
  if (res.canceled) return { ok: false };
  fs.writeFileSync(res.filePath, JSON.stringify(project, null, 2), 'utf8');
  return { ok: true, path: res.filePath };
});

ipcMain.handle('project:load', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir proyecto',
    properties: ['openFile'],
    filters: [{ name: 'Proyecto LibreCut', extensions: ['lcut'] }]
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false };
  const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
  return { ok: true, project: data, path: res.filePaths[0] };
});

ipcMain.handle('app:info', async () => {
  return {
    version: app.getVersion(),
    ffmpeg: exporter.ffmpegPath,
    ffprobe: media.ffprobePath,
    tmp: os.tmpdir()
  };
});
