#!/usr/bin/env node
// LibreCut · código original © 2026 $HAWONDER · github.com/SHAWONDER3301/librecut
// Reel explicativo de LibreCut: guion JSON -> voz neural con tiempos por palabra
// (edge-tts) -> escena HTML animada -> MP4 con el motor HTML de LibreCut.
//
// Uso:
//   node render/reel/reel.mjs <guion.json>              render completo
//   node render/reel/reel.mjs <guion.json> --snap       solo capturas + hoja de contactos (QA rápido)
//   node render/reel/reel.mjs <guion.json> --limit 2    solo las 2 primeras escenas (pruebas)
//   node render/reel/reel.mjs <guion.json> --html       solo genera la escena HTML (sin render)
//   node render/reel/reel.mjs --tipos                   lista los diagramas y sus datos por defecto
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { D } from './diagramas.mjs';
import { construirEscena } from './escena.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const media = require(path.join(ROOT, 'electron', 'media.js'));

// Rutas estilo Git Bash (/c/Users/...) -> c:/Users/...
const norm = (p) => (typeof p === 'string' && /^\/[a-z]\//i.test(p)) ? p[1] + ':' + p.slice(2) : p;
const die = (m) => { console.error('reel: ' + m); process.exit(1); };

const args = process.argv.slice(2);
if (args.includes('--tipos')) {
  for (const [k, d] of Object.entries(D)) {
    console.log(`\n${k}  (${d.design ? 'diseñado para ' + d.design + ' s' : 'se adapta a la duración'})`);
    console.log('  datos: ' + JSON.stringify(d.def));
  }
  process.exit(0);
}
const guionPath = args.find((a) => a.toLowerCase().endsWith('.json'));
if (!guionPath) die('uso: node render/reel/reel.mjs <guion.json> [--snap] [--limit N] [--html]');
const SNAP = args.includes('--snap'), ONLY_HTML = args.includes('--html');
const li = args.indexOf('--limit'), LIMIT = li >= 0 ? Number(args[li + 1]) : 0;

const gpath = path.resolve(norm(guionPath));
const guion = JSON.parse(fs.readFileSync(gpath, 'utf8'));
if (!Array.isArray(guion.escenas) || !guion.escenas.length) die('el guion no tiene "escenas"');
const work = path.resolve(path.dirname(gpath), norm(guion.trabajo) || path.basename(gpath, '.json') + '.work');
fs.mkdirSync(path.join(work, 'tts'), { recursive: true });

const VOZ = guion.voz || 'es-MX-JorgeNeural';
const RATE = guion.velocidad || '+25%';
const PAUSA = guion.pausa ?? 0.3;
const PY = guion.python || process.env.LIBRECUT_PYTHON ||
  [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe')]
    .filter(Boolean).find((p) => fs.existsSync(p)) || 'python';

// --- 1. Voz: un mp3 + tiempos por palabra por escena (con caché por texto) --------
function tts(texto) {
  const h = crypto.createHash('sha1').update(VOZ + '|' + RATE + '|' + texto).digest('hex').slice(0, 12);
  const mp3 = path.join(work, 'tts', h + '.mp3'), wj = path.join(work, 'tts', h + '.words.json');
  if (fs.existsSync(mp3) && fs.statSync(mp3).size > 0 && fs.existsSync(wj)) return { mp3, wj };
  for (let intento = 1; intento <= 4; intento++) {
    const r = spawnSync(PY, [path.join(ROOT, 'render', 'tts_words.py'), texto, VOZ, RATE, mp3, wj], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 0) return { mp3, wj };
    console.error(`  tts intento ${intento} falló: ${(r.stderr || r.error || '').toString().trim().split('\n').pop()}`);
  }
  die('no se pudo generar la voz (edge-tts necesita internet)');
}

const escenas = LIMIT ? guion.escenas.slice(0, LIMIT) : guion.escenas;
const beats = [];
const audio = [];
let cursor = guion.inicio || 0;
for (let i = 0; i < escenas.length; i++) {
  const e = escenas[i];
  const tipo = e.diagrama || 'nucleo';
  if (!D[tipo]) die(`escena ${i + 1}: diagrama desconocido "${tipo}". Disponibles: ${Object.keys(D).join(', ')}`);
  if (!e.voz) die(`escena ${i + 1}: falta "voz" (el texto narrado)`);
  process.stderr.write(`  voz ${i + 1}/${escenas.length}…\r`);
  const { mp3, wj } = tts(e.voz);
  const meta = await media.probe(mp3);
  const start = Math.round(cursor * 1000) / 1000;
  const dur = Math.round((meta.duration + (e.pausa ?? PAUSA)) * 1000) / 1000;
  let words = [];
  try { words = JSON.parse(fs.readFileSync(wj, 'utf8')); } catch { /* sin subtítulos */ }
  beats.push({
    etiqueta: e.etiqueta, titulo: e.titulo, diagrama: tipo, start, dur,
    P: { ...D[tipo].def, ...(e.datos || {}) },
    caps: words.map((w) => ({ t: Math.round((start + w.t) * 1000) / 1000, w: w.w }))
  });
  audio.push({ file: mp3, start, volume: 1 });
  cursor += dur;
}
const total = Math.round((cursor + (guion.cola || 0)) * 1000) / 1000;
if (guion.musica?.archivo) audio.push({ file: path.resolve(path.dirname(gpath), norm(guion.musica.archivo)), start: 0, volume: guion.musica.volumen ?? 0.12 });

// --- 1b. Diseño de sonido (portado del reel de HyperFrames) ------------------------
// Cama ambiental grave + un "whoosh" por corte + un "ding" al final. Todo
// sintetizado con FFmpeg, determinista y sutil. Se mezcla por encima de la voz
// (el motor usa amix normalize=0 + alimiter, así que no baja el volumen de la voz).
// Se apaga con "sonido": false; se afina con "sonido": { cama, whoosh, ding } (0 quita cada uno).
if (guion.sonido !== false && !ONLY_HTML && !SNAP) {
  const son = (guion.sonido && typeof guion.sonido === 'object') ? guion.sonido : {};
  const vCama = son.cama ?? 0.5, vWhoosh = son.whoosh ?? 0.3, vDing = son.ding ?? 0.3;
  let ff = require('ffmpeg-static'); if (ff?.path) ff = ff.path;
  const sdir = path.join(work, 'sfx');
  fs.mkdirSync(sdir, { recursive: true });
  const ffrun = (a) => spawnSync(ff, ['-y', '-loglevel', 'error', ...a]);
  const whoosh = path.join(sdir, 'whoosh.wav'), ding = path.join(sdir, 'ding.wav'), cama = path.join(sdir, 'cama.wav');
  // whoosh y ding son fijos: se cachean. La cama se regenera al largo del vídeo.
  if (vWhoosh > 0 && !fs.existsSync(whoosh)) ffrun(['-f', 'lavfi', '-i', 'anoisesrc=d=0.55:c=pink:a=1', '-af', 'highpass=f=300,lowpass=f=5000,afade=t=in:d=0.2,afade=t=out:st=0.2:d=0.35,volume=2', whoosh]);
  if (vDing > 0 && !fs.existsSync(ding)) ffrun(['-f', 'lavfi', '-i', 'sine=f=1318:d=0.9', '-f', 'lavfi', '-i', 'sine=f=1976:d=0.9', '-filter_complex', '[0][1]amix=inputs=2,afade=t=out:st=0.05:d=0.85,volume=0.6', ding]);
  if (vCama > 0) ffrun(['-f', 'lavfi', '-i', `aevalsrc='0.05*sin(2*PI*110*t)+0.035*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.25*t))+0.02*sin(2*PI*329.63*t)*(0.5+0.5*sin(2*PI*0.17*t))':d=${total.toFixed(2)}:s=48000`, '-af', `lowpass=f=900,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 2).toFixed(2)}:d=2`, cama]);
  if (vCama > 0) audio.push({ file: cama, start: 0, volume: vCama });
  if (vWhoosh > 0) for (let i = 1; i < beats.length; i++) audio.push({ file: whoosh, start: Math.max(0, Math.round((beats[i].start - 0.2) * 1000) / 1000), volume: vWhoosh });
  if (vDing > 0) audio.push({ file: ding, start: Math.max(0, Math.round((total - (guion.cola || 0) - 1.1) * 1000) / 1000), volume: vDing });
}

// --- 2. Escena HTML ----------------------------------------------------------------
const { html, width, height } = construirEscena(guion, beats, total);
const htmlPath = path.join(work, 'escena.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`escena: ${htmlPath}  (${beats.length} escenas, ${total.toFixed(1)} s, ${width}x${height})`);
beats.forEach((b, i) => console.log(`  ${String(i + 1).padStart(2)}. ${b.start.toFixed(2).padStart(6)}s  ${b.dur.toFixed(2)}s  ${b.diagrama}`));
if (ONLY_HTML) process.exit(0);

// --- 3. Render con el motor HTML (Electron offscreen + FFmpeg) ---------------------
function runElectron(job, name) {
  const jobPath = path.join(work, name);
  fs.writeFileSync(jobPath, JSON.stringify(job, null, 2));
  const electronPath = require('electron');
  return new Promise((resolve, reject) => {
    const p = spawn(electronPath, [path.join(ROOT, 'render', 'htmlrender.js'), jobPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const last = out.trim().split('\n').pop() || '';
      try { const r = JSON.parse(last); return r.ok ? resolve(r) : reject(new Error(r.error + ' ' + (r.detail || ''))); }
      catch { return code === 0 ? resolve({}) : reject(new Error('electron salió con ' + code)); }
    });
  });
}

const base = { html: htmlPath, width, height, fps: guion.fps || 30, duration: total };
if (SNAP) {
  // Dos momentos por escena (45% y 88%) + hoja de contactos para revisarlas de un vistazo.
  const dir = path.join(work, 'snaps');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const snapshots = [];
  beats.forEach((b) => [0.45, 0.88].forEach((f) => snapshots.push({
    t: Math.round((b.start + b.dur * f) * 100) / 100,
    out: path.join(dir, 'snap_' + String(snapshots.length + 1).padStart(3, '0') + '.png')
  })));
  await runElectron({ ...base, snapshots }, 'job_snap.json');
  let ff = require('ffmpeg-static'); if (ff?.path) ff = ff.path;
  const cols = height > width ? 6 : 4, rows = Math.ceil(snapshots.length / cols);
  const sheet = path.join(work, 'hoja.png');
  spawnSync(ff, ['-y', '-loglevel', 'error', '-i', path.join(dir, 'snap_%03d.png'), '-vf',
    `scale=${height > width ? 320 : 480}:-1,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', sheet]);
  console.log(`capturas: ${dir}\nhoja de contactos: ${sheet}  (cada escena = 2 cuadros seguidos: 45% y 88%)`);
} else {
  const output = LIMIT ? path.join(work, 'prueba.mp4') : path.resolve(path.dirname(gpath), norm(guion.salida) || path.basename(gpath, '.json') + '.mp4');
  const frameDir = path.join(work, 'frames');
  fs.rmSync(frameDir, { recursive: true, force: true });
  const t0 = Date.now();
  await runElectron({ ...base, output, frameDir, crf: guion.crf ?? 19, preset: 'medium', audio }, 'job.json');
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(`listo: ${output}  (${total.toFixed(1)} s, render ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
