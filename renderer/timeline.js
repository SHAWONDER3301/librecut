import { state, emit, addClip, moveClip, trimClip, findClip, totalDuration } from './store.js';
import { beginChange } from './history.js';

const LANE = 46;          // ancho de la cabecera de pista
const MIN_SEC = 30;       // ancho mínimo visible en segundos

let elTimeline, elRuler, elTracks, elPlayhead;
let drag = null;          // estado de arrastre activo

export function initTimeline() {
  elTimeline = document.getElementById('timeline');
  elRuler = document.getElementById('ruler');
  elTracks = document.getElementById('tracks');
  elPlayhead = document.getElementById('playhead');

  // Mover el cursor pinchando en la regla.
  elRuler.addEventListener('mousedown', (e) => {
    setPlayheadFromEvent(e);
    const move = (ev) => setPlayheadFromEvent(ev);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });

  // Soltar un medio arrastrado desde el bin.
  elTracks.addEventListener('dragover', (e) => { e.preventDefault(); });
  elTracks.addEventListener('drop', (e) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData('mediaId');
    if (!mediaId) return;
    const trackId = trackIdFromY(e.clientY);
    const sec = secFromX(e.clientX);
    const m = state.project.media[mediaId];
    if (!trackId || !m) return;
    const track = state.project.tracks.find((t) => t.id === trackId);
    const wantAudio = m.kind === 'audio';
    // Enruta a una pista compatible si se soltó en la equivocada.
    let targetId = trackId;
    if (wantAudio && track.type !== 'audio') {
      const a = state.project.tracks.find((t) => t.type === 'audio');
      targetId = a ? a.id : trackId;
    } else if (!wantAudio && track.type !== 'video') {
      const v = state.project.tracks.find((t) => t.type === 'video');
      targetId = v ? v.id : trackId;
    }
    addClip(targetId, mediaId, sec);
  });
}

export function renderTimeline() {
  if (!elTracks) return;
  const pps = state.pxPerSec;
  const dur = Math.max(totalDuration(), MIN_SEC);
  const contentW = LANE + dur * pps + 200;

  // Regla
  elRuler.style.width = contentW + 'px';
  elRuler.innerHTML = '';
  const step = tickStep(pps);
  for (let t = 0; t <= dur + step; t += step) {
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    tick.style.left = (LANE + t * pps) + 'px';
    tick.textContent = fmtTime(t);
    elRuler.appendChild(tick);
  }

  // Pistas
  elTracks.innerHTML = '';
  elTracks.style.width = contentW + 'px';
  for (const track of state.project.tracks) {
    const trackEl = document.createElement('div');
    trackEl.className = 'track';
    trackEl.dataset.trackId = track.id;

    const head = document.createElement('div');
    head.className = 'track-head';
    head.textContent = track.name;
    trackEl.appendChild(head);

    const lane = document.createElement('div');
    lane.className = 'track-lane';
    trackEl.appendChild(lane);

    for (const clip of track.clips) {
      lane.appendChild(buildClipEl(clip, track, pps));
    }
    elTracks.appendChild(trackEl);
  }

  // Cursor
  const totalH = elRuler.offsetHeight + elTracks.offsetHeight;
  elPlayhead.style.height = totalH + 'px';
  elPlayhead.style.left = (LANE + state.playhead * pps) + 'px';
}

function buildClipEl(clip, track, pps) {
  const isText = track.type === 'text';
  const m = isText ? null : state.project.media[clip.mediaId];
  const kindCls = isText ? 'text' : (m.kind === 'audio' ? 'audio' : (m.kind === 'image' ? 'image' : 'video'));
  const el = document.createElement('div');
  el.className = 'clip ' + kindCls;
  if (state.selectedClipId === clip.id) el.classList.add('selected');
  el.style.left = (LANE + clip.start * pps) + 'px';
  el.style.width = Math.max(10, clip.duration * pps) + 'px';
  el.dataset.clipId = clip.id;

  const label = document.createElement('div');
  label.className = 'clip-label';
  label.textContent = isText ? ('“' + (clip.text || '') + '”') : m.name;
  el.appendChild(label);

  if (!isText && (m.hasAudio || m.kind === 'audio')) {
    const wave = document.createElement('div');
    wave.className = 'clip-wave';
    if (m.wave && m.duration > 0) {
      // Alinear la porción [inPoint, inPoint+span] de la onda del fichero completo.
      const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      const span = clip.duration * speed;              // segundos de origen mostrados
      const wc = Math.max(10, clip.duration * pps);    // ancho del clip en px
      const fullW = wc * (m.duration / span);          // ancho si se mostrara el fichero entero
      const offX = -(clip.inPoint || 0) / m.duration * fullW;
      wave.classList.add('real');
      wave.style.backgroundImage = `url(${m.wave})`;
      wave.style.backgroundSize = `${fullW}px 100%`;
      wave.style.backgroundPosition = `${offX}px center`;
    }
    el.appendChild(wave);
  }

  const hl = document.createElement('div'); hl.className = 'clip-handle l'; el.appendChild(hl);
  const hr = document.createElement('div'); hr.className = 'clip-handle r'; el.appendChild(hr);

  hl.addEventListener('mousedown', (e) => startTrim(e, clip.id, 'l'));
  hr.addEventListener('mousedown', (e) => startTrim(e, clip.id, 'r'));
  el.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('clip-handle')) return;
    startMove(e, clip.id);
  });
  return el;
}

// --- Arrastres ------------------------------------------------------------

function startMove(e, clipId) {
  e.preventDefault();
  beginChange();
  state.selectedClipId = clipId;
  emit();
  const found = findClip(clipId);
  drag = { type: 'move', clipId, startX: e.clientX, origStart: found.clip.start, origTrackId: found.track.id };
  attachDragWindow();
}

function startTrim(e, clipId, edge) {
  e.preventDefault();
  e.stopPropagation();
  beginChange();
  state.selectedClipId = clipId;
  emit();
  drag = { type: 'trim', clipId, edge, lastX: e.clientX };
  attachDragWindow();
}

function attachDragWindow() {
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragUp);
}

function onDragMove(e) {
  if (!drag) return;
  const pps = state.pxPerSec;
  if (drag.type === 'move') {
    const deltaSec = (e.clientX - drag.startX) / pps;
    const newStart = Math.max(0, drag.origStart + deltaSec);
    const overTrack = trackIdFromY(e.clientY) || drag.origTrackId;
    moveClip(drag.clipId, newStart, overTrack);
  } else if (drag.type === 'trim') {
    const deltaSec = (e.clientX - drag.lastX) / pps;
    drag.lastX = e.clientX;
    trimClip(drag.clipId, drag.edge, deltaSec);
  }
}

function onDragUp() {
  drag = null;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragUp);
}

// --- Utilidades de coordenadas -------------------------------------------

function secFromX(clientX) {
  const rect = elTimeline.getBoundingClientRect();
  const x = clientX - rect.left + elTimeline.scrollLeft - LANE;
  return Math.max(0, x / state.pxPerSec);
}

function trackIdFromY(clientY) {
  const els = elTracks.querySelectorAll('.track');
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (clientY >= r.top && clientY <= r.bottom) return el.dataset.trackId;
  }
  return null;
}

function setPlayheadFromEvent(e) {
  state.playhead = secFromX(e.clientX);
  emit();
}

function tickStep(pps) {
  // Elige un paso de regla legible según el zoom.
  const targetPx = 90;
  const raw = targetPx / pps;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of steps) if (s >= raw) return s;
  return 600;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export { fmtTime };
