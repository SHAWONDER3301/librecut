#!/usr/bin/env node
'use strict';
// LibreCut · código original © 2026 $HAWONDER · github.com/SHAWONDER3301/librecut

// LibreCut CLI — operar el editor sin GUI (pensado para automatización / agentes).
//
// Comandos:
//   probe <fichero>                      Metadatos del medio (JSON)
//   silence <fichero> [in] [dur] [db] [d]  Tramos de silencio (JSON)
//   thumbnail <fichero> [seg] [salida]   Extrae una miniatura JPG
//   render <proyecto.lcut> [-o out.mp4]  Renderiza un proyecto LibreCut
//   make <spec.json> [-o out.mp4]        Compila un spec sencillo y lo renderiza
//   schema                               Imprime el esquema del spec de 'make'
//
// El motor es el mismo que usa la app (electron/exporter.js, electron/media.js),
// que son Node puro sin Electron.

const fs = require('node:fs');
const path = require('node:path');

const media = require(path.join(__dirname, '..', 'electron', 'media.js'));
const exporter = require(path.join(__dirname, '..', 'electron', 'exporter.js'));

const QUALITY = { alta: { crf: 18, preset: 'medium' }, media: { crf: 23, preset: 'medium' }, rapida: { crf: 28, preset: 'veryfast' } };
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
const AUDIO_EXTS = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg'];

function die(msg, code = 1) { console.error('✖ ' + msg); process.exit(code); }
function out(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }
function uid(p) { return p + '_' + Math.random().toString(36).slice(2, 9); }
function round(n) { return Math.round(n * 1000) / 1000; }
function abs(p) {
  // Acepta rutas estilo Git Bash/MSYS (/c/Users/...) y las pasa a Windows (c:/Users/...).
  if (/^\/[a-zA-Z]\//.test(p)) p = p[1] + ':' + p.slice(2);
  return path.resolve(process.cwd(), p);
}

const VALUE_FLAGS = new Set(['output', 'quality', 'w', 'h', 'fps', 'duration', 'audio', 'crf', 'preset']);
function parseFlags(args) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o') { flags.output = args[++i]; continue; }
    if (a === '-q') { flags.quality = args[++i]; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (VALUE_FLAGS.has(key)) flags[key] = args[++i];
      else flags[key] = true; // booleanas (--dry-run, etc.)
    } else pos.push(a);
  }
  return { pos, flags };
}

// --- Comandos simples -----------------------------------------------------

async function cmdProbe(args) {
  const f = args[0]; if (!f) die('uso: probe <fichero>');
  out(await media.probe(abs(f)));
}

async function cmdSilence(args) {
  const f = args[0]; if (!f) die('uso: silence <fichero> [in] [dur] [db] [minDur]');
  const [, inP = 0, dur = 0, db = -30, d = 0.4] = args.map(Number).map((x) => (isNaN(x) ? undefined : x));
  const res = await media.detectSilence(abs(f), inP || 0, dur || 0, db || -30, d || 0.4);
  out(res);
}

async function cmdThumbnail(args) {
  const f = args[0]; if (!f) die('uso: thumbnail <fichero> [seg] [salida.jpg]');
  const t = Number(args[1]) || 0;
  const res = await media.thumbnail(abs(f), t);
  if (!res.ok) die('no se pudo: ' + res.error);
  const dest = args[2] ? abs(args[2]) : abs('thumb.jpg');
  fs.writeFileSync(dest, Buffer.from(res.dataUrl.split(',')[1], 'base64'));
  out({ ok: true, path: dest });
}

// --- Render ---------------------------------------------------------------

function renderProject(project, outputPath) {
  return new Promise((resolve) => {
    let lastPct = -1;
    exporter.run(project, outputPath, {
      onProgress: (pct) => {
        if (pct != null) {
          const p = Math.floor(pct);
          if (p !== lastPct && p % 2 === 0) { lastPct = p; process.stderr.write(`\r  renderizando ${p}%   `); }
        }
      },
      onDone: (r) => { process.stderr.write('\r'); resolve(r); }
    });
  });
}

async function cmdRender(args) {
  const { pos, flags } = parseFlags(args);
  const projPath = pos[0]; if (!projPath) die('uso: render <proyecto.lcut> [-o out.mp4]');
  const project = JSON.parse(fs.readFileSync(abs(projPath), 'utf8'));
  const outPath = abs(flags.output || deriveOut(project, projPath));
  console.error(`→ ${project.width}×${project.height} @${project.fps}  →  ${outPath}`);
  const r = await renderProject(project, outPath);
  if (!r.ok) die('fallo del render: ' + r.error + (r.detail ? '\n' + r.detail : ''));
  out({ ok: true, output: r.path, duration: r.duration });
}

function deriveOut(project, srcPath) {
  const base = (project.name || path.basename(srcPath, path.extname(srcPath)) || 'librecut');
  return `${base}-${project.width}x${project.height}@${project.fps}.mp4`;
}

// --- make: compila un spec sencillo a un proyecto y lo renderiza ----------

function kindOf(file) {
  const e = path.extname(file).toLowerCase();
  if (IMAGE_EXTS.includes(e)) return 'image';
  if (AUDIO_EXTS.includes(e)) return 'audio';
  return 'video';
}

function defaultTracks() {
  return [
    { id: 't1', type: 'text', name: 'Txt', index: 2, clips: [] },
    { id: 'v2', type: 'video', name: 'V2', index: 1, clips: [] },
    { id: 'v1', type: 'video', name: 'V1', index: 0, clips: [] },
    { id: 'a1', type: 'audio', name: 'A1', index: 0, clips: [] }
  ];
}

async function compileSpec(spec) {
  const [w, h] = (spec.resolution || `${spec.width || 1920}x${spec.height || 1080}`).split('x').map(Number);
  const q = QUALITY[spec.quality || 'alta'] || QUALITY.alta;
  const project = {
    name: spec.name || 'proyecto',
    width: w || 1920, height: h || 1080, fps: spec.fps || 30,
    preset: spec.preset || q.preset, crf: (spec.crf != null ? spec.crf : q.crf),
    progressBar: !!spec.progressBar, accent: spec.accent || undefined,
    media: {}, tracks: defaultTracks()
  };

  const mediaByPath = new Map();
  async function ensureMedia(file) {
    const ap = abs(file);
    if (mediaByPath.has(ap)) return mediaByPath.get(ap);
    if (!fs.existsSync(ap)) die('no existe el fichero: ' + ap);
    const meta = await media.probe(ap);
    if (!meta.ok) die('no se pudo leer: ' + ap + ' (' + meta.error + ')');
    const id = uid('m');
    project.media[id] = { id, ...meta };
    mediaByPath.set(ap, id);
    return id;
  }

  const trackById = (name) => project.tracks.find((t) => t.id === name || t.name === name);
  const trackEnd = (t) => t.clips.reduce((mx, c) => Math.max(mx, c.start + c.duration), 0);

  for (const item of (spec.clips || [])) {
    // Clip de texto
    if (item.text != null && !item.file) {
      const t = trackById(item.track || 'Txt') || trackById('t1');
      const start = (item.start != null) ? item.start : trackEnd(t);
      t.clips.push({
        id: uid('c'), type: 'text', text: String(item.text),
        start: round(start), duration: round(item.duration || 3),
        fontSize: item.fontSize || 64, fontColor: item.color || 'white', pos: item.pos || 'bottom',
        animIn: item.animIn || item.anim || 'fade',
        fadeIn: item.fadeIn || 0, fadeOut: item.fadeOut || 0
      });
      continue;
    }

    // Clip de medio
    const file = item.file; if (!file) die('cada clip necesita "file" o "text"');
    const mediaId = await ensureMedia(file);
    const m = project.media[mediaId];
    const k = m.kind;
    let trackName = item.track || (k === 'audio' ? 'A1' : 'V1');
    let t = trackById(trackName);
    if (!t) die('pista desconocida: ' + trackName + ' (usa V1, V2, A1 o Txt)');
    if (k === 'audio' && t.type !== 'audio') t = trackById('A1');
    if (k !== 'audio' && t.type === 'audio') t = trackById('V1');

    const start = (item.start != null) ? item.start : trackEnd(t);
    const inPoint = item.in || item.inPoint || 0;
    let duration = item.duration;
    if (duration == null) {
      const speed = item.speed || 1;
      duration = (k === 'image') ? 5 : Math.max(0.1, ((m.duration || 5) - inPoint) / speed);
    }

    const base = {
      id: uid('c'), mediaId,
      start: round(start), inPoint: round(inPoint), duration: round(duration),
      volume: (item.volume != null ? item.volume : 1), muted: !!item.muted,
      speed: item.speed || 1, fadeIn: item.fadeIn || 0, fadeOut: item.fadeOut || 0,
      xfadeIn: item.xfadeIn || 0, transition: item.transition || 'fade',
      kenburns: item.kenburns || null
    };

    if (item.removeSilence && k !== 'image') {
      const span = base.duration * base.speed;
      const sil = await media.detectSilence(m.path, base.inPoint, span,
        (item.silenceDb || -30), (item.silenceMinDur || 0.4));
      const pieces = cutSilences(base, sil.intervals || []);
      if (pieces.length) { for (const p of pieces) t.clips.push(p); continue; }
    }
    t.clips.push(base);
  }

  // Ordena por tiempo cada pista
  for (const t of project.tracks) t.clips.sort((a, b) => a.start - b.start);
  return project;
}

// Convierte un clip + silencios en varios clips pegados (ripple).
function cutSilences(clip, intervals) {
  const speed = clip.speed || 1;
  const span = clip.duration * speed;
  const sound = [];
  let cur = 0;
  for (const s of intervals.slice().sort((a, b) => a.start - b.start)) {
    const a = Math.max(0, Math.min(span, s.start));
    const b = Math.max(0, Math.min(span, s.end));
    if (a > cur + 0.05) sound.push({ s: cur, e: a });
    cur = Math.max(cur, b);
  }
  if (cur < span - 0.05) sound.push({ s: cur, e: span });

  const res = [];
  let cursor = clip.start;
  for (const seg of sound) {
    const tlDur = (seg.e - seg.s) / speed;
    if (tlDur < 0.1) continue;
    res.push({
      id: uid('c'), mediaId: clip.mediaId,
      start: round(cursor), inPoint: round(clip.inPoint + seg.s), duration: round(tlDur),
      volume: clip.volume, muted: clip.muted, speed, fadeIn: 0, fadeOut: 0, xfadeIn: 0
    });
    cursor += tlDur;
  }
  return res;
}

async function cmdMake(args) {
  const { pos, flags } = parseFlags(args);
  const specPath = pos[0]; if (!specPath) die('uso: make <spec.json> [-o out.mp4]');
  const spec = JSON.parse(fs.readFileSync(abs(specPath), 'utf8'));
  if (flags.quality) spec.quality = flags.quality;
  const project = await compileSpec(spec);

  const outPath = abs(flags.output || spec.output || deriveOut(project, specPath));
  if (flags['dry-run']) { out({ ok: true, dryRun: true, project }); return; }

  console.error(`→ ${project.width}×${project.height} @${project.fps}  (${Object.keys(project.media).length} medios)  →  ${outPath}`);
  const r = await renderProject(project, outPath);
  if (!r.ok) die('fallo del render: ' + r.error + (r.detail ? '\n' + r.detail : ''));
  out({ ok: true, output: r.path, duration: r.duration });
}

// renderhtml: renderiza una escena HTML animada (seek-safe) a MP4 con Electron.
async function cmdRenderHtml(args) {
  const { pos, flags } = parseFlags(args);
  const scene = pos[0];
  if (!scene) die('uso: renderhtml <escena.html> -o out.mp4 --duration N [--audio f@start,...] [--w 1080 --h 1920 --fps 30]');
  const W = Number(flags.w) || 1080, H = Number(flags.h) || 1920, FPS = Number(flags.fps) || 30;

  const audio = [];
  if (typeof flags.audio === 'string') {
    for (const part of flags.audio.split(',')) {
      const [f, s] = part.split('@');
      audio.push({ file: abs(f), start: Number(s) || 0, volume: 1 });
    }
  }
  let duration = Number(flags.duration) || 0;
  if (!duration) {
    for (const a of audio) { const m = await media.probe(a.file); if (m.ok) duration = Math.max(duration, a.start + m.duration); }
    if (!duration) die('indica --duration N (o pasa --audio para deducirla)');
  }

  const os = require('node:os');
  const job = {
    html: abs(scene), width: W, height: H, fps: FPS, duration: Math.round(duration * 1000) / 1000,
    output: abs(flags.output || 'escena.mp4'),
    frameDir: path.join(os.tmpdir(), 'librecut-frames-' + Date.now()),
    crf: flags.crf ? Number(flags.crf) : 19, preset: flags.preset || 'medium', audio
  };
  const jobPath = path.join(os.tmpdir(), 'librecut-job-' + Date.now() + '.json');
  fs.writeFileSync(jobPath, JSON.stringify(job));

  const electronPath = require('electron'); // en node devuelve la ruta al binario
  const runner = path.join(__dirname, '..', 'render', 'htmlrender.js');
  console.error(`→ ${W}×${H} @${FPS}, ${job.duration}s  →  ${job.output}`);
  const { spawn } = require('node:child_process');
  await new Promise((resolve) => {
    const p = spawn(electronPath, [runner, jobPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    let sout = '';
    p.stdout.on('data', (d) => { sout += d; });
    p.on('close', (code) => {
      try { const r = JSON.parse(sout.trim().split('\n').pop()); out(r); } catch { out({ ok: code === 0 }); }
      resolve();
    });
  });
}

function cmdSchema() {
  out({
    description: 'Spec de LibreCut para el comando make. Pistas: V1/V2 (vídeo), Txt (texto), A1 (audio).',
    ejemplo: {
      output: 'salida.mp4',
      resolution: '1920x1080',
      fps: 30,
      quality: 'alta | media | rapida',
      progressBar: true,
      accent: '0x6d5cff',
      clips: [
        { file: 'intro.mp4', track: 'V1', start: 0, in: 0, duration: 5, fadeIn: 0.5, kenburns: 'in' },
        { file: 'parte2.mp4', track: 'V1', in: 2, duration: 4, xfadeIn: 0.8, transition: 'slideleft', kenburns: 'out', removeSilence: true },
        { text: 'Mi título', track: 'Txt', start: 1, duration: 3, pos: 'center', fontSize: 84, color: 'white', animIn: 'up' },
        { file: 'musica.mp3', track: 'A1', start: 0, duration: 9, volume: 0.6, fadeOut: 1 }
      ],
      animaciones: {
        'texto animIn': 'fade | up | down | left | right',
        'clip transition (con xfadeIn)': 'fade | slideleft | slideright | slideup | slidedown',
        'clip kenburns (zoom/pan)': 'in | out | left | right',
        'progressBar / accent': 'barra de progreso global y su color'
      },
      notas: [
        'Si omites "start", el clip se coloca tras el último de su pista.',
        'Si omites "duration", se usa la duración del medio (desde "in").',
        '"removeSilence": true parte el clip quitando los silencios (ripple).'
      ]
    }
  });
}

// --- Dispatch -------------------------------------------------------------

function help() {
  console.log(`LibreCut CLI — editor de vídeo headless

  probe <fichero>                         Metadatos del medio (JSON)
  silence <fichero> [in] [dur] [db] [d]   Tramos de silencio (JSON)
  thumbnail <fichero> [seg] [salida.jpg]  Extrae una miniatura
  render <proyecto.lcut> [-o out.mp4]     Renderiza un proyecto LibreCut
  make <spec.json> [-o out.mp4] [-q ...]  Compila un spec sencillo y lo renderiza
  renderhtml <escena.html> -o out.mp4     Renderiza una escena HTML animada (motion por código)
             --duration N [--audio f@start,...] [--w --h --fps]
  schema                                  Muestra el esquema del spec de 'make'

Ejemplos:
  node cli/librecut.js probe video.mp4
  node cli/librecut.js make guion.json -o reel.mp4
  node cli/librecut.js make guion.json --dry-run    (ver el proyecto sin renderizar)
`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'probe': return await cmdProbe(rest);
      case 'silence': return await cmdSilence(rest);
      case 'thumbnail': return await cmdThumbnail(rest);
      case 'render': return await cmdRender(rest);
      case 'make': return await cmdMake(rest);
      case 'renderhtml': return await cmdRenderHtml(rest);
      case 'schema': return cmdSchema();
      case 'help': case '--help': case '-h': case undefined: return help();
      default: die('comando desconocido: ' + cmd + ' (usa help)');
    }
  } catch (e) {
    die(e.stack || e.message);
  }
}

main();
