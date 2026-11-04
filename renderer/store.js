// Estado global simple con suscripción. Sin frameworks.
import { beginChange, resetHistory } from './history.js';

function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

const listeners = new Set();

export const state = {
  project: {
    name: 'proyecto',
    width: 1920,
    height: 1080,
    fps: 30,
    preset: 'medium',
    crf: 18,
    media: {},   // id -> metadatos
    tracks: [
      { id: 't1', type: 'text', name: 'Txt', index: 2, clips: [] },
      { id: 'v2', type: 'video', name: 'V2', index: 1, clips: [] },
      { id: 'v1', type: 'video', name: 'V1', index: 0, clips: [] },
      { id: 'a1', type: 'audio', name: 'A1', index: 0, clips: [] }
    ]
  },
  playhead: 0,
  selectedClipId: null,
  pxPerSec: 100,
  playing: false
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(); }

export function addMedia(meta) {
  beginChange();
  const id = uid('m');
  state.project.media[id] = { id, ...meta };
  emit();
  return id;
}

export function getTrack(trackId) {
  return state.project.tracks.find((t) => t.id === trackId);
}

export function findClip(clipId) {
  for (const t of state.project.tracks) {
    const c = t.clips.find((x) => x.id === clipId);
    if (c) return { clip: c, track: t };
  }
  return null;
}

// Coloca un clip nuevo en una pista evitando solapamientos (empuja al hueco).
export function addClip(trackId, mediaId, startSec) {
  const track = getTrack(trackId);
  const m = state.project.media[mediaId];
  if (!track || !m) return null;
  beginChange();

  const dur = (m.kind === 'image') ? 5 : (m.duration || 1);
  let start = Math.max(0, startSec);
  start = avoidOverlap(track, start, dur, null);

  const clip = {
    id: uid('c'),
    mediaId,
    start: round(start),
    inPoint: 0,
    duration: round(dur),
    volume: 1,
    muted: false,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0
  };
  track.clips.push(clip);
  sortTrack(track);
  state.selectedClipId = clip.id;
  emit();
  return clip;
}

export function moveClip(clipId, newStart, newTrackId) {
  const found = findClip(clipId);
  if (!found) return;
  let { clip, track } = found;
  if (newTrackId && newTrackId !== track.id) {
    const nt = getTrack(newTrackId);
    // Sólo permitir cambio de pista del mismo "tipo compatible":
    // audio puro -> pistas de audio; vídeo/imagen -> pistas de vídeo.
    const m = state.project.media[clip.mediaId];
    const wantAudio = m.kind === 'audio';
    if (nt && ((wantAudio && nt.type === 'audio') || (!wantAudio && nt.type === 'video'))) {
      track.clips = track.clips.filter((c) => c.id !== clipId);
      nt.clips.push(clip);
      track = nt;
    }
  }
  const start = avoidOverlap(track, Math.max(0, newStart), clip.duration, clipId);
  clip.start = round(start);
  sortTrack(track);
  emit();
}

export function trimClip(clipId, edge, deltaSec) {
  const found = findClip(clipId);
  if (!found) return;
  const { clip } = found;
  const isText = found.track.type === 'text';
  const m = isText ? null : state.project.media[clip.mediaId];
  const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
  const srcDur = isText ? Infinity : ((m.kind === 'image') ? Infinity : (m.duration || clip.duration * speed));

  if (edge === 'l') {
    const srcDelta = deltaSec * speed;              // origen consumido al mover el borde
    let newIn = clip.inPoint + srcDelta;
    let newStart = clip.start + deltaSec;
    let newDur = clip.duration - deltaSec;
    if (!isText && newIn < 0) { const k = -newIn / speed; newIn = 0; newStart += k; newDur -= k; }
    if (newDur < 0.1 || newStart < 0) return;
    clip.inPoint = round(Math.max(0, newIn));
    clip.start = round(newStart);
    clip.duration = round(newDur);
  } else {
    let newDur = clip.duration + deltaSec;
    if (newDur < 0.1) newDur = 0.1;
    if (!isText && m.kind !== 'image' && clip.inPoint + newDur * speed > srcDur) {
      newDur = (srcDur - clip.inPoint) / speed;
    }
    clip.duration = round(newDur);
  }
  emit();
}

// Texto como clip en la pista de texto.
export function addText(tSec, text = 'Texto') {
  const track = state.project.tracks.find((t) => t.type === 'text');
  if (!track) return null;
  beginChange();
  const dur = 3;
  const start = avoidOverlap(track, Math.max(0, tSec), dur, null);
  const clip = {
    id: uid('c'), type: 'text', text,
    start: round(start), duration: dur,
    fontSize: 64, fontColor: 'white', pos: 'bottom',
    fadeIn: 0, fadeOut: 0
  };
  track.clips.push(clip);
  sortTrack(track);
  state.selectedClipId = clip.id;
  emit();
  return clip;
}

export function setClipProp(clipId, key, value) {
  const found = findClip(clipId);
  if (!found) return;
  found.clip[key] = value;
  emit();
}

// Reemplaza un clip por sus tramos con sonido, pegados (ripple) desde su inicio.
export function applySilenceCut(clipId, intervals) {
  const found = findClip(clipId);
  if (!found) return { ok: false, removed: 0 };
  beginChange();
  const { clip, track } = found;
  const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
  const span = clip.duration * speed; // segundos de origen del clip

  // Complemento de los silencios = tramos con sonido (en segundos de origen, 0..span).
  const sound = [];
  let cur = 0;
  const iv = intervals.slice().sort((a, b) => a.start - b.start);
  for (const s of iv) {
    const sStart = Math.max(0, Math.min(span, s.start));
    const sEnd = Math.max(0, Math.min(span, s.end));
    if (sStart > cur + 0.05) sound.push({ s: cur, e: sStart });
    cur = Math.max(cur, sEnd);
  }
  if (cur < span - 0.05) sound.push({ s: cur, e: span });

  if (sound.length === 0) { deleteClip(clipId); return { ok: true, removed: 1, segments: 0 }; }

  const newClips = [];
  let cursor = clip.start;
  for (const seg of sound) {
    const tlDur = (seg.e - seg.s) / speed;
    if (tlDur < 0.1) continue;
    newClips.push({
      id: uid('c'), mediaId: clip.mediaId,
      start: round(cursor), inPoint: round(clip.inPoint + seg.s),
      duration: round(tlDur), volume: clip.volume, muted: clip.muted,
      speed, fadeIn: 0, fadeOut: 0
    });
    cursor += tlDur;
  }
  track.clips = track.clips.filter((c) => c.id !== clipId).concat(newClips);
  sortTrack(track);
  state.selectedClipId = newClips.length ? newClips[0].id : null;
  const removedSec = span - sound.reduce((a, s) => a + (s.e - s.s), 0);
  emit();
  return { ok: true, pieces: newClips.length, removedSec: round(removedSec / speed) };
}

export function activeTextClips(tSec) {
  const out = [];
  for (const t of state.project.tracks) {
    if (t.type !== 'text') continue;
    for (const c of t.clips) if (tSec >= c.start && tSec < c.start + c.duration) out.push(c);
  }
  return out;
}

// Divide el clip que cruza el tiempo t (en segundos), en su pista.
export function splitAt(tSec, clipId) {
  let targets = [];
  if (clipId) {
    const f = findClip(clipId);
    if (f) targets = [f];
  } else {
    for (const t of state.project.tracks) {
      for (const c of t.clips) targets.push({ clip: c, track: t });
    }
  }
  let didSplit = false;
  let snapped = false;
  for (const { clip, track } of targets) {
    const end = clip.start + clip.duration;
    if (tSec > clip.start + 0.05 && tSec < end - 0.05) {
      if (!snapped) { beginChange(); snapped = true; }
      const leftDur = tSec - clip.start;
      const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      const right = {
        ...clip,
        id: uid('c'),
        start: round(tSec),
        inPoint: round((clip.inPoint || 0) + leftDur * speed),
        duration: round(clip.duration - leftDur),
        fadeIn: 0 // el fundido de entrada se queda en la parte izquierda
      };
      clip.fadeOut = 0; // y el de salida en la derecha
      clip.duration = round(leftDur);
      track.clips.push(right);
      sortTrack(track);
      didSplit = true;
    }
  }
  if (didSplit) emit();
  return didSplit;
}

export function deleteClip(clipId) {
  for (const t of state.project.tracks) {
    const n = t.clips.length;
    if (!t.clips.some((c) => c.id === clipId)) continue;
    beginChange();
    t.clips = t.clips.filter((c) => c.id !== clipId);
    if (t.clips.length !== n) { if (state.selectedClipId === clipId) state.selectedClipId = null; emit(); return; }
  }
}

export function totalDuration() {
  let d = 0;
  for (const t of state.project.tracks) {
    for (const c of t.clips) d = Math.max(d, c.start + c.duration);
  }
  return d;
}

// Clip de vídeo activo en el tiempo t de la pista de vídeo más alta.
export function activeVideoClip(tSec) {
  const vtracks = state.project.tracks
    .filter((t) => t.type === 'video')
    .sort((a, b) => b.index - a.index); // más alta primero
  for (const t of vtracks) {
    for (const c of t.clips) {
      const m = state.project.media[c.mediaId];
      if (m.kind === 'audio') continue;
      if (tSec >= c.start && tSec < c.start + c.duration) return { clip: c, media: m };
    }
  }
  return null;
}

function avoidOverlap(track, start, dur, ignoreId) {
  const others = track.clips.filter((c) => c.id !== ignoreId).sort((a, b) => a.start - b.start);
  let s = start;
  const end = () => s + dur;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (const o of others) {
      const oEnd = o.start + o.duration;
      if (s < oEnd && end() > o.start) { s = oEnd; changed = true; }
    }
  }
  return s;
}

function sortTrack(track) { track.clips.sort((a, b) => a.start - b.start); }
function round(n) { return Math.round(n * 1000) / 1000; }

export function loadProject(proj) {
  resetHistory();
  state.project = proj;
  state.selectedClipId = null;
  state.playhead = 0;
  emit();
}
