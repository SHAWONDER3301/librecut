// Historial simple: guarda instantáneas del proyecto antes de cada cambio.
import { state, emit } from './store.js';

let undoStack = [];
let redoStack = [];
const MAX = 100;

function snap() { return JSON.parse(JSON.stringify(state.project)); }

// Llamar JUSTO ANTES de un cambio (el estado aún es el previo).
export function beginChange() {
  const s = snap();
  const top = undoStack[undoStack.length - 1];
  if (top && JSON.stringify(top) === JSON.stringify(s)) return; // evita duplicados
  undoStack.push(s);
  if (undoStack.length > MAX) undoStack.shift();
  redoStack.length = 0;
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snap());
  state.project = undoStack.pop();
  state.selectedClipId = null;
  emit();
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snap());
  state.project = redoStack.pop();
  state.selectedClipId = null;
  emit();
  return true;
}

export function resetHistory() { undoStack = []; redoStack = []; }
export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }
