'use strict';

// Motor de exportación de LibreCut: compone la timeline en un filter_complex de
// FFmpeg. Soporta animación por código (sin motor de terceros):
//   - Texto animado: entrada con fade + deslizamiento (up/down/left/right).
//   - Transiciones entre clips: crossfade (alfa) y slides/wipe (overlay animado).
//   - Ken Burns / zoom en imágenes y vídeo (zoompan).
//   - Fondos en movimiento (Ken Burns sobre la imagen de fondo).
//   - Barra de progreso opcional.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function resolveBin(mod) {
  let p = require(mod);
  if (p && typeof p === 'object' && p.path) p = p.path;
  if (typeof p === 'string' && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked');
  return p;
}
const ffmpegPath = resolveBin('ffmpeg-static');

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
function isImage(p) { return IMAGE_EXTS.includes(path.extname(p).toLowerCase()); }

function fpsToRational(fps) {
  const map = { 23.976: '24000/1001', 29.97: '30000/1001', 59.94: '60000/1001' };
  return map[fps] || String(fps);
}

function atempoChain(s) {
  const out = [];
  let r = s;
  while (r > 2.0) { out.push(2.0); r /= 2.0; }
  while (r < 0.5) { out.push(0.5); r *= 2.0; }
  out.push(Math.round(r * 10000) / 10000);
  return out.map((x) => `atempo=${x}`);
}

function fontFileArg() {
  const candidates = ['C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf'];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch { /* */ } }
  return candidates[0];
}
function escFilterPath(p) { return p.replace(/\\/g, '/').replace(/:/g, '\\:'); }

// Expresión zoompan para Ken Burns.
function kenburnsChain(kind, W, H, frames, R) {
  const big = `scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)}:force_original_aspect_ratio=increase,crop=${Math.round(W * 1.3)}:${Math.round(H * 1.3)}`;
  let z, x = `'iw/2-(iw/zoom/2)'`, y = `'ih/2-(ih/zoom/2)'`;
  const step = 0.0012;
  if (kind === 'out') z = `'if(eq(on,0),1.14,max(zoom-${step},1.0))'`;
  else if (kind === 'left') { z = `'1.14'`; x = `'(1-on/${frames})*(iw-iw/zoom)'`; }
  else if (kind === 'right') { z = `'1.14'`; x = `'(on/${frames})*(iw-iw/zoom)'`; }
  else z = `'min(zoom+${step},1.14)'`; // 'in' por defecto
  return `${big},zoompan=z=${z}:x=${x}:y=${y}:d=${frames}:s=${W}x${H}:fps=${R}`;
}

// Expresiones de texto animado (valores entre comillas simples para proteger comas).
function textAnim(startT, endT, dur, animIn, baseY) {
  const D = Math.min(0.4, Math.max(0.15, dur / 3));
  const s = startT.toFixed(3), e = endT.toFixed(3), d = D.toFixed(3);
  const alpha = `'clip(min((t-${s})/${d},(${e}-t)/${d}),0,1)'`;
  const pin = `(1-clip((t-${s})/${d},0,1))`; // 1 -> 0 durante la entrada
  let x = `(w-text_w)/2`, y = baseY;
  const off = 90;
  if (animIn === 'up') y = `(${baseY})+${off}*${pin}`;
  else if (animIn === 'down') y = `(${baseY})-${off}*${pin}`;
  else if (animIn === 'left') x = `(w-text_w)/2+${off * 3}*${pin}`;
  else if (animIn === 'right') x = `(w-text_w)/2-${off * 3}*${pin}`;
  return { x: `'${x}'`, y: `'${y}'`, alpha };
}

function buildCommand(project, outputPath) {
  const W = project.width || 1920;
  const H = project.height || 1080;
  const FPS = project.fps || 30;
  const R = fpsToRational(FPS);
  const AR = 48000;
  const accent = project.accent || '0x6d5cff';
  const tmpFiles = [];

  const media = project.media || {};
  const tracks = (project.tracks || []).slice();
  const videoTracks = tracks.filter((t) => t.type === 'video').sort((a, b) => a.index - b.index);
  const textTracks = tracks.filter((t) => t.type === 'text');

  const videoClips = [];
  for (const t of videoTracks) for (const c of (t.clips || [])) {
    const m = media[c.mediaId];
    if (!m || m.kind === 'audio') continue;
    videoClips.push({ ...c, media: m });
  }
  const audioClips = [];
  for (const t of tracks) for (const c of (t.clips || [])) {
    const m = media[c.mediaId];
    if (!m) continue;
    if (t.type === 'audio' || (t.type === 'video' && m.hasAudio && c.muted !== true)) {
      if (m.kind === 'image') continue;
      audioClips.push({ ...c, media: m });
    }
  }
  const textClips = [];
  for (const t of textTracks) for (const c of (t.clips || [])) textClips.push(c);

  let duration = 0;
  for (const t of tracks) for (const c of (t.clips || [])) duration = Math.max(duration, (c.start || 0) + (c.duration || 0));
  if (duration <= 0) duration = 1;
  duration = Math.round(duration * 1000) / 1000;

  const inputArgs = [];
  const inputIndex = new Map();
  let idx = 0;
  const seen = new Map();
  for (const id of Object.keys(media)) {
    const m = media[id];
    const key = m.path + (isImage(m.path) ? '#img' : '');
    if (seen.has(key)) { inputIndex.set(id, seen.get(key)); continue; }
    if (isImage(m.path)) inputArgs.push('-loop', '1', '-i', m.path);
    else inputArgs.push('-i', m.path);
    inputIndex.set(id, idx); seen.set(key, idx); idx++;
  }

  const hasText = textClips.length > 0;
  const hasBar = !!project.progressBar;
  // Etiqueta donde termina la composición de vídeo+texto, antes de la barra.
  const bodyLabel = hasBar ? 'vbody' : 'vout';

  const fc = [];
  fc.push(`color=c=black:s=${W}x${H}:r=${R}:d=${duration}[vbase]`);

  let lastV = 'vbase';
  videoClips.forEach((c, i) => {
    const inI = inputIndex.get(c.mediaId);
    const speed = (c.speed && c.speed > 0) ? c.speed : 1;
    const inSec = c.inPoint || 0;
    const startT = c.start || 0;
    const endT = startT + (c.duration || 0);
    const fadeOut = Math.min(c.fadeOut || 0, c.duration || 0);
    const label = `v${i}`;
    const chain = [];

    let xfd = Math.max(0, Math.min(c.xfadeIn || 0, startT));
    if (c.media.kind !== 'image') xfd = Math.min(xfd, inSec / speed);
    const transition = (xfd > 0) ? (c.transition || 'fade') : 'none';
    const isSlide = transition.startsWith('slide') || transition.startsWith('wipe');
    const startEff = startT - xfd;
    const visDur = (c.duration || 0) + xfd;
    const fadeIn = xfd > 0 ? 0 : Math.min(c.fadeIn || 0, c.duration || 0);
    const useAlpha = xfd > 0 && !isSlide; // crossfade por alfa
    const frames = Math.max(1, Math.round(visDur * FPS));

    if (c.media.kind === 'image') {
      chain.push(`trim=duration=${visDur.toFixed(4)}`, 'setpts=PTS-STARTPTS');
    } else {
      const trimStart = inSec - xfd * speed;
      chain.push(`trim=start=${trimStart.toFixed(4)}:end=${(trimStart + visDur * speed).toFixed(4)}`, 'setpts=PTS-STARTPTS');
      if (speed !== 1) chain.push(`setpts=PTS/${speed}`);
    }

    if (c.kenburns) {
      chain.push(kenburnsChain(c.kenburns, W, H, frames, R));
    } else {
      chain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
      chain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`);
    }
    chain.push('setsar=1', `fps=${R}`);
    chain.push(useAlpha ? 'format=yuva420p' : 'format=yuv420p');
    if (useAlpha) chain.push(`fade=t=in:st=0:d=${xfd.toFixed(4)}:alpha=1`);
    else if (fadeIn > 0) chain.push(`fade=t=in:st=0:d=${fadeIn.toFixed(4)}`);
    if (fadeOut > 0) chain.push(`fade=t=out:st=${(visDur - fadeOut).toFixed(4)}:d=${fadeOut.toFixed(4)}`);
    chain.push(`setpts=PTS+${startEff.toFixed(4)}/TB`);
    fc.push(`[${inI}:v]${chain.join(',')}[${label}]`);

    // Posición del overlay: fija, o animada para slides/wipe.
    let ox = '0', oy = '0';
    if (isSlide && xfd > 0) {
      const se = startEff.toFixed(3), xe = (startEff + xfd).toFixed(3), xf = xfd.toFixed(3);
      const prog = `clip((t-${se})/${xf},0,1)`; // 0 -> 1 durante el solape
      if (transition === 'slideleft') ox = `'if(lt(t,${xe}),${W}*(1-${prog}),0)'`;
      else if (transition === 'slideright') ox = `'if(lt(t,${xe}),-${W}*(1-${prog}),0)'`;
      else if (transition === 'slideup') oy = `'if(lt(t,${xe}),${H}*(1-${prog}),0)'`;
      else if (transition === 'slidedown') oy = `'if(lt(t,${xe}),-${H}*(1-${prog}),0)'`;
    }
    const out = (i === videoClips.length - 1) ? (hasText ? 'vcomp' : bodyLabel) : `vov${i}`;
    fc.push(`[${lastV}][${label}]overlay=${ox}:${oy}:eof_action=pass:repeatlast=0:enable='between(t,${startEff.toFixed(4)},${endT.toFixed(4)})'[${out}]`);
    lastV = out;
  });
  if (videoClips.length === 0) {
    const out = hasText ? 'vcomp' : bodyLabel;
    fc.push(`[vbase]null[${out}]`);
    lastV = out;
  }

  if (hasText) {
    const font = escFilterPath(fontFileArg());
    let prev = 'vcomp';
    textClips.forEach((c, i) => {
      const hash = crypto.createHash('md5').update(String(c.id) + c.text).digest('hex').slice(0, 10);
      const tf = path.join(os.tmpdir(), 'librecut-text-' + hash + '.txt');
      try { fs.writeFileSync(tf, String(c.text || ''), 'utf8'); tmpFiles.push(tf); } catch { /* */ }
      const fsz = c.fontSize || 64;
      const color = c.fontColor || 'white';
      const startT = c.start || 0;
      const endT = startT + (c.duration || 0);
      let baseY = '(h-text_h)/2';
      if (c.pos === 'top') baseY = 'h*0.08';
      else if (c.pos === 'bottom') baseY = 'h*0.84';
      const a = textAnim(startT, endT, c.duration || 1, c.animIn || 'fade', baseY);
      const out = (i === textClips.length - 1) ? bodyLabel : `vtx${i}`;
      const dt = [
        `drawtext=fontfile='${font}'`, `textfile='${escFilterPath(tf)}'`,
        `fontsize=${fsz}`, `fontcolor=${color}`,
        `x=${a.x}`, `y=${a.y}`, `alpha=${a.alpha}`,
        `box=1:boxcolor=black@0.35:boxborderw=16`,
        `enable='between(t,${startT.toFixed(4)},${endT.toFixed(4)})'`
      ].join(':');
      fc.push(`[${prev}]${dt}[${out}]`);
      prev = out;
    });
  }

  if (hasBar) {
    fc.push(`[vbody]drawbox=x=0:y=${H - 10}:w='${W}*min(t/${duration},1)':h=10:color=${accent}@0.95:t=fill[vout]`);
  }

  // Audio
  const aLabels = [];
  fc.push(`anullsrc=r=${AR}:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[abase]`);
  aLabels.push('abase');
  audioClips.forEach((c, i) => {
    const inI = inputIndex.get(c.mediaId);
    const speed = (c.speed && c.speed > 0) ? c.speed : 1;
    const inSec = c.inPoint || 0;
    const startT = c.start || 0;
    const vol = (typeof c.volume === 'number') ? c.volume : 1;
    const fadeOut = Math.min(c.fadeOut || 0, c.duration || 0);
    const label = `a${i}`;
    let xfd = Math.max(0, Math.min(c.xfadeIn || 0, startT, inSec / speed));
    const startEff = startT - xfd;
    const visDur = (c.duration || 0) + xfd;
    const fadeIn = xfd > 0 ? xfd : Math.min(c.fadeIn || 0, c.duration || 0);
    const trimStart = inSec - xfd * speed;
    const delayMs = Math.round(startEff * 1000);
    const chain = [`atrim=start=${trimStart.toFixed(4)}:end=${(trimStart + visDur * speed).toFixed(4)}`, 'asetpts=PTS-STARTPTS'];
    if (speed !== 1) chain.push(...atempoChain(speed));
    chain.push(`aresample=${AR}`, `volume=${vol}`);
    if (fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fadeIn.toFixed(4)}`);
    if (fadeOut > 0) chain.push(`afade=t=out:st=${(visDur - fadeOut).toFixed(4)}:d=${fadeOut.toFixed(4)}`);
    chain.push(`adelay=${delayMs}|${delayMs}`, 'apad');
    fc.push(`[${inI}:a]${chain.join(',')}[${label}]`);
    aLabels.push(label);
  });
  fc.push(`${aLabels.map((l) => `[${l}]`).join('')}amix=inputs=${aLabels.length}:normalize=0:duration=first[amix]`);
  fc.push(`[amix]atrim=duration=${duration},alimiter=limit=0.98[aout]`);

  const filtergraph = fc.join(';');
  const args = [
    '-y', ...inputArgs,
    '-filter_complex', filtergraph,
    '-map', '[vout]', '-map', '[aout]',
    '-r', R,
    '-c:v', 'libx264', '-preset', project.preset || 'medium', '-crf', String(project.crf != null ? project.crf : 18),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', String(AR),
    '-movflags', '+faststart',
    '-t', String(duration),
    '-progress', 'pipe:1', '-nostats',
    outputPath
  ];
  return { args, filtergraph, duration, tmpFiles };
}

function run(project, outputPath, { onProgress, onDone }) {
  let built;
  try { built = buildCommand(project, outputPath); }
  catch (e) { onDone({ ok: false, error: 'Error construyendo el comando: ' + e.message }); return { cancel() {} }; }

  const { args, filtergraph, duration } = built;
  const logPath = path.join(os.tmpdir(), 'librecut-last-export.log');
  try {
    fs.writeFileSync(logPath, 'ffmpeg ' + args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') + '\n\n--- filter_complex ---\n' + filtergraph + '\n', 'utf8');
  } catch { /* */ }

  const ff = spawn(ffmpegPath, args);
  let stderrTail = '';
  let cancelled = false;
  ff.stdout.on('data', (d) => {
    const m = d.toString().match(/out_time_(?:ms|us)=(\d+)/);
    if (m) {
      const sec = parseInt(m[1], 10) / 1e6;
      const pct = Math.max(0, Math.min(99.5, (sec / duration) * 100));
      if (onProgress) onProgress(pct, null);
    }
  });
  ff.stderr.on('data', (d) => {
    const t = d.toString();
    stderrTail = (stderrTail + t).slice(-4000);
    if (onProgress) onProgress(null, t.trim().split('\n').pop());
  });
  ff.on('close', (code) => {
    try { fs.appendFileSync(logPath, '\n--- stderr (cola) ---\n' + stderrTail); } catch { /* */ }
    if (cancelled) onDone({ ok: false, cancelled: true, error: 'Exportación cancelada.' });
    else if (code === 0) onDone({ ok: true, path: outputPath, duration, logPath });
    else onDone({ ok: false, error: 'FFmpeg terminó con código ' + code, detail: stderrTail.slice(-1400), logPath });
  });
  ff.on('error', (e) => onDone({ ok: false, error: 'No se pudo lanzar FFmpeg: ' + e.message }));
  return { cancel() { cancelled = true; try { ff.kill('SIGKILL'); } catch { /* */ } } };
}

module.exports = { run, buildCommand, ffmpegPath };
