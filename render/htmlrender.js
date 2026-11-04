'use strict';

// Motor HTML -> vídeo de LibreCut.
// Renderiza una escena HTML animada de forma DETERMINISTA: la escena expone
// window.seek(t) y este runner la mueve fotograma a fotograma, captura cada
// frame con Electron y los codifica con FFmpeg (+ audio). Seek-safe, sin
// depender del reloj real (nada de requestAnimationFrame para la animación).
//
// Uso:  electron render/htmlrender.js <job.json>
// job: { html, width, height, fps, duration, output, frameDir?, audio:[{file,start,volume}], crf?, preset? }

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function resolveFfmpeg() {
  let p = require('ffmpeg-static');
  if (p && typeof p === 'object' && p.path) p = p.path;
  if (typeof p === 'string' && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
  return p;
}
const ffmpegPath = resolveFfmpeg();

const jobPath = process.argv.find((a) => a.toLowerCase().endsWith('.json'));
if (!jobPath) { console.error('falta job.json'); process.exit(2); }
const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

// Normaliza rutas estilo Git Bash (/c/Users/...) a Windows (c:/Users/...).
const norm = (p) => (typeof p === 'string' && /^\/[a-z]\//i.test(p)) ? p[1] + ':' + p.slice(2) : p;
job.html = norm(job.html);
job.output = norm(job.output);
if (job.frameDir) job.frameDir = norm(job.frameDir);
if (Array.isArray(job.audio)) job.audio.forEach((a) => { a.file = norm(a.file); });

app.disableHardwareAcceleration();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const W = job.width || 1080, H = job.height || 1920, FPS = job.fps || 30;
  const duration = job.duration || 5;
  const frameDir = job.frameDir || fs.mkdtempSync(path.join(os.tmpdir(), 'librecut-frames-'));
  fs.mkdirSync(frameDir, { recursive: true });

  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false, useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, zoomFactor: 1 }
  });
  win.webContents.setFrameRate(60);
  try { win.setContentSize(W, H); } catch { /* */ }

  await win.loadFile(path.resolve(job.html));
  try { win.setContentSize(W, H); } catch { /* */ }
  await sleep(80);
  // Espera a que la escena defina seek()
  for (let i = 0; i < 100; i++) {
    const ok = await win.webContents.executeJavaScript('typeof window.seek==="function"').catch(() => false);
    if (ok) break;
    await sleep(30);
  }

  // Modo snapshot: captura fotogramas sueltos en tiempos dados (QA rápido).
  if (Array.isArray(job.snapshots)) {
    for (const snap of job.snapshots) {
      await win.webContents.executeJavaScript(`window.seek(${snap.t});true`).catch(() => {});
      const img = await capture(win);
      const sz = img.getSize();
      fs.writeFileSync(norm(snap.out), img.toPNG());
      process.stderr.write('  snap t=' + snap.t + ' ' + sz.width + 'x' + sz.height + '\n');
    }
    console.log(JSON.stringify({ ok: true, snapshots: job.snapshots.length }));
    app.quit();
    return;
  }

  const total = Math.round(duration * FPS);
  const pad = (n) => String(n).padStart(5, '0');

  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    await win.webContents.executeJavaScript(`window.seek(${t});document.title='f'+${i};true`).catch(() => {});
    const img = await capture(win);
    if (i === 0) { const sz = img.getSize(); process.stderr.write('  frame0 ' + sz.width + 'x' + sz.height + '\n'); }
    fs.writeFileSync(path.join(frameDir, 'f' + pad(i) + '.png'), img.toPNG());
    if (i % 15 === 0) process.stderr.write('\r  capturando ' + i + '/' + total + '   ');
  }
  process.stderr.write('\r  capturados ' + total + ' frames        \n');

  await encode(frameDir, W, H, FPS, duration);
  app.quit();
}

// Captura un fotograma actual y completo: espera a que la página pinte el
// estado presente (dos requestAnimationFrame) y lo extrae con capturePage
// (pull-based, nunca un frame viejo ni parcial).
async function capture(win) {
  try {
    await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  } catch { /* */ }
  try { return await win.webContents.capturePage(); }
  catch { return require('electron').nativeImage.createEmpty(); }
}

function encode(frameDir, W, H, FPS, duration) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%05d.png')];
    const audio = job.audio || [];
    for (const a of audio) args.push('-i', a.file);

    const fc = [];
    const aLabels = [];
    audio.forEach((a, i) => {
      const inIdx = i + 1; // 0 es la secuencia de frames
      const delay = Math.round((a.start || 0) * 1000);
      const vol = (a.volume != null ? a.volume : 1);
      fc.push(`[${inIdx}:a]aresample=48000,volume=${vol},adelay=${delay}|${delay},apad[a${i}]`);
      aLabels.push(`[a${i}]`);
    });

    let mapAudio = [];
    if (audio.length) {
      fc.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[abase]`);
      fc.push(`[abase]${aLabels.join('')}amix=inputs=${audio.length + 1}:normalize=0:duration=first,atrim=duration=${duration},alimiter=limit=0.98[aout]`);
    }

    if (fc.length) args.push('-filter_complex', fc.join(';'));
    args.push('-map', '0:v');
    if (audio.length) args.push('-map', '[aout]');
    args.push(
      '-c:v', 'libx264', '-preset', job.preset || 'medium', '-crf', String(job.crf != null ? job.crf : 20),
      '-pix_fmt', 'yuv420p', '-r', String(FPS),
      '-movflags', '+faststart', '-t', String(duration)
    );
    if (audio.length) args.push('-c:a', 'aac', '-b:a', '192k');
    args.push(job.output);

    const logPath = path.join(os.tmpdir(), 'librecut-htmlrender.log');
    try { fs.writeFileSync(logPath, 'ffmpeg ' + args.join(' ') + '\n'); } catch { /* */ }

    const ff = spawn(ffmpegPath, args);
    let err = '';
    ff.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    ff.on('close', (code) => {
      if (code === 0) { console.log(JSON.stringify({ ok: true, output: job.output, duration })); resolve(); }
      else { console.log(JSON.stringify({ ok: false, error: 'ffmpeg ' + code, detail: err.slice(-800) })); reject(new Error('ffmpeg ' + code)); }
    });
    ff.on('error', (e) => { console.log(JSON.stringify({ ok: false, error: e.message })); reject(e); });
  });
}

app.whenReady().then(main).catch((e) => { console.error(e); app.quit(); });
