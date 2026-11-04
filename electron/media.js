'use strict';

// Sondeo de medios (duración, dimensiones, fps, audio) y miniaturas, vía FFmpeg.
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

function resolveBin(mod, exeName) {
  // Los paquetes *-static exponen la ruta al binario. En algunos empaquetados
  // la ruta apunta dentro de app.asar; la corregimos a .unpacked si hace falta.
  let p = require(mod);
  if (p && typeof p === 'object' && p.path) p = p.path;
  if (typeof p === 'string' && p.includes('app.asar')) {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  return p;
}

const ffmpegPath = resolveBin('ffmpeg-static');
const ffprobePath = resolveBin('ffprobe-static');

function probe(filePath) {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];
    execFile(ffprobePath, args, { maxBuffer: 1024 * 1024 * 16 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, error: err.message, path: filePath });
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const v = streams.find((s) => s.codec_type === 'video');
        const a = streams.find((s) => s.codec_type === 'audio');
        const fmt = data.format || {};

        let duration = parseFloat(fmt.duration);
        if (!isFinite(duration) && v && v.duration) duration = parseFloat(v.duration);
        if (!isFinite(duration) && a && a.duration) duration = parseFloat(a.duration);

        let fps = 0;
        if (v && v.r_frame_rate && v.r_frame_rate.includes('/')) {
          const [n, d] = v.r_frame_rate.split('/').map(Number);
          if (d) fps = n / d;
        }

        const ext = path.extname(filePath).toLowerCase();
        const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
        let kind = 'video';
        if (imageExts.includes(ext)) kind = 'image';
        else if (!v && a) kind = 'audio';

        resolve({
          ok: true,
          path: filePath,
          name: path.basename(filePath),
          kind,
          duration: isFinite(duration) ? duration : (kind === 'image' ? 5 : 0),
          width: v ? v.width : 0,
          height: v ? v.height : 0,
          fps: Math.round(fps * 1000) / 1000,
          hasAudio: !!a,
          hasVideo: !!v,
          vcodec: v ? v.codec_name : null,
          acodec: a ? a.codec_name : null
        });
      } catch (e) {
        resolve({ ok: false, error: e.message, path: filePath });
      }
    });
  });
}

function thumbnail(filePath, timeSec = 0) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('md5').update(filePath + ':' + timeSec).digest('hex').slice(0, 12);
    const out = path.join(os.tmpdir(), 'librecut-thumb-' + hash + '.jpg');

    if (fs.existsSync(out)) {
      try {
        const b64 = fs.readFileSync(out).toString('base64');
        resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,' + b64 });
        return;
      } catch { /* regenerar */ }
    }

    const args = [
      '-y',
      '-ss', String(Math.max(0, timeSec)),
      '-i', filePath,
      '-frames:v', '1',
      '-vf', 'scale=240:-1:force_original_aspect_ratio=decrease',
      '-q:v', '4',
      out
    ];
    const ff = spawn(ffmpegPath, args);
    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(out)) {
        try {
          const b64 = fs.readFileSync(out).toString('base64');
          resolve({ ok: true, dataUrl: 'data:image/jpeg;base64,' + b64 });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      } else {
        resolve({ ok: false, error: stderr.slice(-400) });
      }
    });
    ff.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// Genera una forma de onda del fichero completo (0..duración) como PNG dataURL.
function waveform(filePath, width = 2000, height = 60) {
  return new Promise((resolve) => {
    const hash = crypto.createHash('md5').update('wave:' + filePath + width + height).digest('hex').slice(0, 12);
    const out = path.join(os.tmpdir(), 'librecut-wave-' + hash + '.png');
    const done = () => {
      try { resolve({ ok: true, dataUrl: 'data:image/png;base64,' + fs.readFileSync(out).toString('base64') }); }
      catch (e) { resolve({ ok: false, error: e.message }); }
    };
    if (fs.existsSync(out)) { done(); return; }

    const args = [
      '-y', '-i', filePath,
      '-filter_complex', `aformat=channel_layouts=mono,showwavespic=s=${width}x${height}:colors=white`,
      '-frames:v', '1', out
    ];
    const ff = spawn(ffmpegPath, args);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', (code) => { (code === 0 && fs.existsSync(out)) ? done() : resolve({ ok: false, error: err.slice(-300) }); });
    ff.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// Detecta tramos de silencio en [inPoint, inPoint+span] del fichero.
// Devuelve intervalos {start,end} relativos al inicio del recorte (0..span).
function detectSilence(filePath, inPoint = 0, span = 0, noiseDb = -30, minDur = 0.4) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-nostats'];
    if (inPoint > 0) args.push('-ss', String(inPoint));
    if (span > 0) args.push('-t', String(span));
    args.push('-i', filePath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDur}`, '-f', 'null', '-');

    const ff = spawn(ffmpegPath, args);
    let err = '';
    ff.stderr.on('data', (d) => { err += d.toString(); });
    ff.on('close', () => {
      const intervals = [];
      let curStart = null;
      const re = /silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(err)) !== null) {
        const kind = m[1];
        const val = parseFloat(m[2]);
        if (kind === 'start') curStart = Math.max(0, val);
        else if (kind === 'end' && curStart !== null) {
          intervals.push({ start: curStart, end: val });
          curStart = null;
        }
      }
      if (curStart !== null) intervals.push({ start: curStart, end: span || curStart });
      resolve({ ok: true, intervals });
    });
    ff.on('error', (e) => resolve({ ok: false, error: e.message, intervals: [] }));
  });
}

module.exports = { probe, thumbnail, waveform, detectSilence, ffmpegPath, ffprobePath };
