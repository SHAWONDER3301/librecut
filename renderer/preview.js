import { state, emit, activeVideoClip, activeTextClips, totalDuration } from './store.js';

// Motor de previsualización. Reproduce la pista de vídeo más alta activa bajo
// el cursor (vídeo + su audio). La mezcla multipista completa es cosa del
// export; esto es una vista de referencia honesta y fluida.

let videoEl, emptyEl;
let rafId = null;
let lastTick = 0;
let currentMediaId = null;
let onFrame = () => {};

export function initPreview(cb) {
  videoEl = document.getElementById('preview');
  emptyEl = document.getElementById('preview-empty');
  onFrame = cb || (() => {});
  videoEl.addEventListener('ended', () => { /* el bucle RAF decide el siguiente clip */ });
}

export function play() {
  if (state.playing) return;
  if (state.playhead >= totalDuration()) state.playhead = 0;
  state.playing = true;
  lastTick = performance.now();
  emit();
  loop();
}

export function pause() {
  state.playing = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (videoEl) videoEl.pause();
  emit();
}

export function togglePlay() { state.playing ? pause() : play(); }

// Refresca el fotograma mostrado para el cursor actual (con pausa o scrub).
export function refreshFrame() {
  if (!videoEl) return;
  updateTextOverlays(state.playhead);
  const active = activeVideoClip(state.playhead);
  if (!active) {
    videoEl.style.display = 'none';
    emptyEl.style.display = 'block';
    currentMediaId = null;
    if (!videoEl.paused) videoEl.pause();
    return;
  }
  emptyEl.style.display = 'none';
  videoEl.style.display = 'block';

  const speed = (active.clip.speed && active.clip.speed > 0) ? active.clip.speed : 1;
  const url = window.api.mediaUrl(active.media.path);
  if (currentMediaId !== active.clip.id) {
    currentMediaId = active.clip.id;
    if (videoEl.src !== url) videoEl.src = url;
  }
  try { videoEl.playbackRate = speed; } catch { /* */ }
  const into = (active.clip.inPoint || 0) + (state.playhead - active.clip.start) * speed;
  if (!state.playing) seekTo(into);
}

// Capa de texto sobre el vídeo (aproximada; la posición exacta es del export).
let textLayer = null;
function updateTextOverlays(t) {
  const wrap = document.getElementById('preview-wrap');
  if (!wrap) return;
  if (!textLayer) {
    textLayer = document.createElement('div');
    textLayer.id = 'text-layer';
    wrap.appendChild(textLayer);
  }
  const clips = activeTextClips(t);
  textLayer.innerHTML = '';
  for (const c of clips) {
    const d = document.createElement('div');
    d.className = 'text-ov ' + (c.pos || 'bottom');
    d.textContent = c.text || '';
    d.style.color = c.fontColor || 'white';
    d.style.fontSize = Math.max(10, (c.fontSize || 64) / 1080 * (wrap.clientHeight || 400)) + 'px';
    textLayer.appendChild(d);
  }
}

function seekTo(t) {
  const doSeek = () => { try { videoEl.currentTime = Math.max(0, t); } catch { /* */ } };
  if (videoEl.readyState >= 1) doSeek();
  else videoEl.addEventListener('loadedmetadata', doSeek, { once: true });
}

function loop() {
  if (!state.playing) return;
  const now = performance.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  state.playhead += dt;
  const total = totalDuration();
  if (state.playhead >= total) {
    state.playhead = total;
    pause();
    return;
  }

  const active = activeVideoClip(state.playhead);
  if (!active) {
    // Hueco: nada que mostrar, pero el tiempo sigue corriendo.
    videoEl.style.display = 'none';
    emptyEl.style.display = 'block';
    if (!videoEl.paused) videoEl.pause();
    currentMediaId = null;
  } else {
    emptyEl.style.display = 'none';
    videoEl.style.display = 'block';
    const speed = (active.clip.speed && active.clip.speed > 0) ? active.clip.speed : 1;
    const url = window.api.mediaUrl(active.media.path);
    const into = (active.clip.inPoint || 0) + (state.playhead - active.clip.start) * speed;

    if (currentMediaId !== active.clip.id) {
      currentMediaId = active.clip.id;
      videoEl.src = url;
      videoEl.addEventListener('loadedmetadata', () => {
        try { videoEl.playbackRate = speed; videoEl.currentTime = Math.max(0, into); } catch { /* */ }
        if (state.playing) videoEl.play().catch(() => {});
      }, { once: true });
    } else {
      try { videoEl.playbackRate = speed; } catch { /* */ }
      const drift = Math.abs(videoEl.currentTime - into);
      if (drift > 0.3) { try { videoEl.currentTime = into; } catch { /* */ } }
      if (videoEl.paused) videoEl.play().catch(() => {});
    }
  }

  updateTextOverlays(state.playhead);
  onFrame();
  rafId = requestAnimationFrame(loop);
}
