import { state, subscribe, emit, addMedia, findClip, splitAt, deleteClip, totalDuration, loadProject, addText, setClipProp, applySilenceCut } from './store.js';
import { initTimeline, renderTimeline, fmtTime } from './timeline.js';
import { initPreview, togglePlay, play, pause, refreshFrame } from './preview.js';
import { undo, redo, beginChange } from './history.js';

const QUALITY = { alta: { crf: 18, preset: 'medium' }, media: { crf: 23, preset: 'medium' }, rapida: { crf: 28, preset: 'veryfast' } };

const $ = (id) => document.getElementById(id);

// --- Arranque -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  initTimeline();
  initPreview(renderPlayhead); // callback ligero por fotograma
  wireToolbar();
  wireTransport();
  wireKeyboard();
  wireExportModal();

  // Snapshot de historial al empezar a editar un control del inspector.
  document.getElementById('inspector').addEventListener('pointerdown', (e) => {
    if (e.target.matches('input, select, textarea')) beginChange();
  });

  subscribe(renderAll);
  renderAll();

  window.api.info().then((info) => { document.title = `LibreCut ${info.version}`; });
});

// --- Render ---------------------------------------------------------------
function renderAll() {
  renderBin();
  renderTimeline();
  renderInspector();
  renderPlayhead();
  refreshFrame();
  const bp = document.getElementById('btn-play');
  if (bp) bp.textContent = state.playing ? '❚❚' : '▶';
}

function renderPlayhead() {
  document.getElementById('time-cur').textContent = fmtTime(state.playhead);
  document.getElementById('time-total').textContent = fmtTime(totalDuration());
  // mover el cursor sin reconstruir la timeline
  const ph = document.getElementById('playhead');
  if (ph) ph.style.left = (46 + state.playhead * state.pxPerSec) + 'px';
}

function renderBin() {
  const list = document.getElementById('bin-list');
  const ids = Object.keys(state.project.media);
  if (ids.length === 0) {
    list.innerHTML = '<p class="empty">Importa vídeo, audio o imágenes para empezar.</p>';
    return;
  }
  list.innerHTML = '';
  for (const id of ids) {
    const m = state.project.media[id];
    const item = document.createElement('div');
    item.className = 'bin-item';
    item.draggable = true;
    item.dataset.mediaId = id;

    const thumb = document.createElement('div');
    thumb.className = 'bin-thumb';
    if (m.thumb) thumb.style.backgroundImage = `url(${m.thumb})`;
    else thumb.textContent = m.kind === 'audio' ? '♪' : (m.kind === 'image' ? '🖼' : '🎬');

    const meta = document.createElement('div');
    meta.className = 'bin-meta';
    const dur = m.kind === 'image' ? 'imagen' : fmtTime(m.duration || 0);
    meta.innerHTML = `<div class="bin-name" title="${m.name}">${m.name}</div>` +
      `<div class="bin-sub">${m.kind} · ${dur}${m.width ? ` · ${m.width}×${m.height}` : ''}</div>`;

    item.appendChild(thumb);
    item.appendChild(meta);
    item.addEventListener('dragstart', (e) => e.dataTransfer.setData('mediaId', id));
    list.appendChild(item);
  }
}

function renderInspector() {
  const body = document.getElementById('inspector-body');
  const found = state.selectedClipId ? findClip(state.selectedClipId) : null;
  if (!found) { body.innerHTML = '<p class="empty">Selecciona un clip.</p>'; return; }
  const { clip, track } = found;

  if (track.type === 'text') {
    body.innerHTML = `
      <div class="insp-row"><label>Texto</label><textarea id="t-text" rows="2">${esc(clip.text || '')}</textarea></div>
      <div class="insp-row"><label>Tamaño <span id="t-size-val">${clip.fontSize || 64}px</span></label>
        <input id="t-size" type="range" min="16" max="200" value="${clip.fontSize || 64}"></div>
      <div class="insp-row"><label>Color</label>
        <select id="t-color">${['white','black','yellow','red','cyan','orange'].map((c) => `<option ${((clip.fontColor || 'white') === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="insp-row"><label>Posición</label>
        <select id="t-pos">${['top','center','bottom'].map((p) => `<option value="${p}" ${((clip.pos || 'bottom') === p) ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      ${fadeRows(clip)}
      <div class="insp-row"><label>Inicio / Duración</label><div class="insp-val">${fmtTime(clip.start)} · ${fmtTime(clip.duration)}</div></div>
    `;
    bind('t-text', 'input', (el) => { clip.text = el.value; liveUpdate(); });
    bind('t-size', 'input', (el) => { document.getElementById('t-size-val').textContent = el.value + 'px'; clip.fontSize = Number(el.value); liveUpdate(); });
    bind('t-color', 'change', (el) => { clip.fontColor = el.value; liveUpdate(); });
    bind('t-pos', 'change', (el) => { clip.pos = el.value; liveUpdate(); });
    wireFades(clip);
    return;
  }

  const m = state.project.media[clip.mediaId];
  const spd = clip.speed || 1;
  body.innerHTML = `
    <div class="insp-row"><label>Medio</label><div class="insp-val">${esc(m.name)}</div></div>
    <div class="insp-row"><label>Inicio · Duración</label><div class="insp-val">${fmtTime(clip.start)} · ${fmtTime(clip.duration)}</div></div>
    <div class="insp-row"><label>Velocidad</label>
      <select id="c-speed">${[0.25,0.5,1,1.5,2,4].map((s) => `<option value="${s}" ${spd === s ? 'selected' : ''}>${s}×</option>`).join('')}</select></div>
    <div class="insp-row"><label>Crossfade entrada <span id="xf-val">${(clip.xfadeIn || 0).toFixed(1)}s</span></label>
      <input id="xfade" type="range" min="0" max="2" step="0.1" value="${clip.xfadeIn || 0}">
      <div class="insp-hint">Funde este clip con lo anterior (solápalo pegándolo al clip previo).</div></div>
    ${fadeRows(clip)}
    ${m.kind !== 'image' ? `<div class="insp-row"><label>Volumen <span id="vol-val">${Math.round((clip.volume ?? 1) * 100)}%</span></label>
      <input id="vol" type="range" min="0" max="200" value="${Math.round((clip.volume ?? 1) * 100)}"></div>` : ''}
  `;
  bind('c-speed', 'change', (el) => {
    const newSpeed = Number(el.value);
    const srcDur = m.kind === 'image' ? Infinity : (m.duration || clip.duration * (clip.speed || 1));
    // Mantener el mismo tramo de origen al cambiar la velocidad.
    const srcSpan = clip.duration * (clip.speed || 1);
    let newDur = srcSpan / newSpeed;
    if (clip.inPoint + newDur * newSpeed > srcDur) newDur = (srcDur - clip.inPoint) / newSpeed;
    clip.speed = newSpeed; clip.duration = Math.round(newDur * 1000) / 1000; emit();
  });
  bind('vol', 'input', (el) => { clip.volume = Number(el.value) / 100; document.getElementById('vol-val').textContent = el.value + '%'; });
  bind('xfade', 'input', (el) => { clip.xfadeIn = Number(el.value); document.getElementById('xf-val').textContent = Number(el.value).toFixed(1) + 's'; });
  wireFades(clip);
}

// Refresca preview + timeline sin reconstruir el inspector (no pierde foco/arrastre).
function liveUpdate() { renderTimeline(); refreshFrame(); renderPlayhead(); }

function fadeRows(clip) {
  return `
    <div class="insp-row"><label>Fundido entrada <span id="fi-val">${(clip.fadeIn || 0).toFixed(1)}s</span></label>
      <input id="fade-in" type="range" min="0" max="3" step="0.1" value="${clip.fadeIn || 0}"></div>
    <div class="insp-row"><label>Fundido salida <span id="fo-val">${(clip.fadeOut || 0).toFixed(1)}s</span></label>
      <input id="fade-out" type="range" min="0" max="3" step="0.1" value="${clip.fadeOut || 0}"></div>`;
}
function wireFades(clip) {
  bind('fade-in', 'input', (el) => { document.getElementById('fi-val').textContent = Number(el.value).toFixed(1) + 's'; clip.fadeIn = Number(el.value); });
  bind('fade-out', 'input', (el) => { document.getElementById('fo-val').textContent = Number(el.value).toFixed(1) + 's'; clip.fadeOut = Number(el.value); });
}
function bind(id, ev, fn) { const el = document.getElementById(id); if (el) el.addEventListener(ev, () => fn(el)); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// --- Toolbar --------------------------------------------------------------
function wireToolbar() {
  document.getElementById('btn-import').addEventListener('click', importMedia);
  document.getElementById('btn-text').addEventListener('click', () => addText(state.playhead));
  document.getElementById('btn-silence').addEventListener('click', removeSilences);
  document.getElementById('btn-split').addEventListener('click', () => {
    splitAt(state.playhead, state.selectedClipId);
  });
  document.getElementById('btn-delete').addEventListener('click', () => {
    if (state.selectedClipId) deleteClip(state.selectedClipId);
  });
  document.getElementById('sel-res').addEventListener('change', (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    state.project.width = w; state.project.height = h; emit();
  });
  document.getElementById('sel-fps').addEventListener('change', (e) => {
    state.project.fps = Number(e.target.value); emit();
  });
  document.getElementById('sel-quality').addEventListener('change', (e) => {
    const q = QUALITY[e.target.value] || QUALITY.alta;
    state.project.crf = q.crf; state.project.preset = q.preset;
  });
  document.getElementById('btn-save').addEventListener('click', async () => {
    const res = await window.api.saveProject(state.project);
    if (res.ok) flash('Proyecto guardado.');
  });
  document.getElementById('btn-open').addEventListener('click', async () => {
    const res = await window.api.loadProject();
    if (res.ok) {
      loadProject(res.project);
      document.getElementById('sel-res').value = `${state.project.width}x${state.project.height}`;
      document.getElementById('sel-fps').value = String(state.project.fps);
    }
  });
  document.getElementById('btn-export').addEventListener('click', startExport);
}

async function importMedia() {
  const paths = await window.api.openMedia();
  for (const p of paths) {
    const meta = await window.api.probe(p);
    if (!meta.ok) { flash('No se pudo leer: ' + meta.name); continue; }
    const id = addMedia(meta);
    // Miniatura (vídeo/imagen) en segundo plano.
    if (meta.kind !== 'audio') {
      window.api.thumbnail(p, Math.min(1, (meta.duration || 2) / 2)).then((t) => {
        if (t.ok) { state.project.media[id].thumb = t.dataUrl; emit(); }
      });
    }
    // Forma de onda real para audio y vídeo con audio.
    if (meta.kind === 'audio' || meta.hasAudio) {
      window.api.waveform(p).then((w) => {
        if (w.ok) { state.project.media[id].wave = w.dataUrl; emit(); }
      });
    }
  }
}

async function removeSilences() {
  const found = state.selectedClipId ? findClip(state.selectedClipId) : null;
  if (!found || found.track.type === 'text') { flash('Selecciona un clip de vídeo o audio.'); return; }
  const { clip } = found;
  const m = state.project.media[clip.mediaId];
  if (!m || (!m.hasAudio && m.kind !== 'audio')) { flash('El clip no tiene audio.'); return; }

  const btn = document.getElementById('btn-silence');
  const prev = btn.textContent;
  btn.textContent = 'Analizando…'; btn.disabled = true;
  try {
    const speed = clip.speed || 1;
    const span = clip.duration * speed;
    const res = await window.api.detectSilence(m.path, clip.inPoint || 0, span, -30, 0.4);
    if (!res.ok) { flash('No se pudo analizar: ' + res.error); return; }
    if (!res.intervals.length) { flash('No se detectaron silencios.'); return; }
    const r = applySilenceCut(clip.id, res.intervals);
    flash(`Silencios quitados: ${r.pieces} tramo(s), ~${r.removedSec}s eliminados.`);
  } finally {
    btn.textContent = prev; btn.disabled = false;
  }
}

// --- Transporte -----------------------------------------------------------
function wireTransport() {
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  const zoom = document.getElementById('zoom');
  zoom.addEventListener('input', () => { state.pxPerSec = Number(zoom.value); emit(); });
}

function wireKeyboard() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 's' || e.key === 'S') { splitAt(state.playhead, state.selectedClipId); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selectedClipId) deleteClip(state.selectedClipId); }
    else if (e.key === 'Home') { state.playhead = 0; emit(); }
    else if (e.key === 'ArrowLeft') { state.playhead = Math.max(0, state.playhead - (e.shiftKey ? 1 : 1 / state.project.fps)); emit(); }
    else if (e.key === 'ArrowRight') { state.playhead = Math.min(totalDuration(), state.playhead + (e.shiftKey ? 1 : 1 / state.project.fps)); emit(); }
  });
}

// --- Exportación ----------------------------------------------------------
let unsubProgress = null;

async function startExport() {
  if (totalDuration() <= 0) { flash('Añade al menos un clip a la timeline.'); return; }
  const suggested = (state.project.name || 'librecut') + `-${state.project.width}x${state.project.height}@${state.project.fps}.mp4`;
  const out = await window.api.pickOutput(suggested);
  if (!out) return;

  if (state.playing) pause();

  const modal = document.getElementById('export-modal');
  const bar = document.getElementById('progress-bar');
  const status = document.getElementById('export-status');
  const btnCancel = document.getElementById('btn-cancel-export');
  const btnClose = document.getElementById('btn-close-export');

  modal.classList.remove('hidden');
  bar.style.width = '0%';
  status.textContent = 'Preparando FFmpeg…';
  btnCancel.classList.remove('hidden');
  btnClose.classList.add('hidden');

  unsubProgress = window.api.onExportProgress(({ pct, line }) => {
    if (pct != null) { bar.style.width = pct.toFixed(1) + '%'; status.textContent = `Procesando… ${pct.toFixed(1)}%`; }
    else if (line) { status.textContent = line; }
  });

  const result = await window.api.runExport(state.project, out);
  if (unsubProgress) { unsubProgress(); unsubProgress = null; }

  btnCancel.classList.add('hidden');
  btnClose.classList.remove('hidden');
  if (result.ok) {
    bar.style.width = '100%';
    status.textContent = `✅ Listo: ${result.path}`;
  } else if (result.cancelled) {
    status.textContent = '⏹ Exportación cancelada.';
  } else {
    status.textContent = `❌ Error: ${result.error}\n${result.detail || ''}`;
  }
}

function wireExportModal() {
  document.getElementById('btn-cancel-export').addEventListener('click', async () => {
    await window.api.cancelExport();
  });
  document.getElementById('btn-close-export').addEventListener('click', () => {
    document.getElementById('export-modal').classList.add('hidden');
  });
}

// --- Varios ---------------------------------------------------------------
let toastTimer = null;
function flash(msg) {
  console.log('[LibreCut]', msg);
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
