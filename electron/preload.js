'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// API segura expuesta al renderer. Sin acceso directo a Node ni a la red.
contextBridge.exposeInMainWorld('api', {
  openMedia: () => ipcRenderer.invoke('media:open'),
  probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  thumbnail: (filePath, timeSec) => ipcRenderer.invoke('media:thumbnail', filePath, timeSec),
  detectSilence: (filePath, inPoint, span, noiseDb, minDur) => ipcRenderer.invoke('media:silence', filePath, inPoint, span, noiseDb, minDur),
  waveform: (filePath) => ipcRenderer.invoke('media:waveform', filePath),

  pickOutput: (suggestedName) => ipcRenderer.invoke('export:pickOutput', suggestedName),
  runExport: (project, outputPath) => ipcRenderer.invoke('export:run', project, outputPath),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },

  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  loadProject: () => ipcRenderer.invoke('project:load'),

  info: () => ipcRenderer.invoke('app:info'),

  // Construye una URL servible por el <video>/<img> a partir de una ruta local.
  mediaUrl: (absPath) => 'media://f/?p=' + encodeURIComponent(absPath)
});
