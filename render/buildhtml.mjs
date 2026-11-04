// Escena Opus 5.5 en estilo "CotiPro": horizontal 1920x1080, negro + azul,
// titular arriba-izquierda, diagrama animado a la derecha y subtítulos karaoke
// sincronizados palabra a palabra (tiempos de edge-tts WordBoundary).
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));   // .../render
const ROOT = path.resolve(HERE, '..');                       // raíz del proyecto
const SCENE = path.join(HERE, 'scenes', 'opus55.html');
const require = createRequire(path.join(ROOT, 'package.json'));
const media = require(path.join(ROOT, 'electron', 'media.js'));

const T = process.argv[2].replace(/^\/([a-z])\//i, (m, d) => d + ':/');
const LIMIT = process.argv[3] && !isNaN(process.argv[3]) ? Number(process.argv[3]) : 0;
const SNAP = process.argv.includes('--snap');

// Paleta CotiPro
const BLUE = '#2f80ff', BLUE2 = '#5a9bff', CARD = '#0d1626', STROKE = 'rgba(120,160,255,.22)', GRAY = '#7d8aa5';
const MONO = `font-family="Consolas, 'Cascadia Mono', monospace"`;

// Paleta cálida (naranja/rojo): se reemplazan los tonos azules en todo el HTML.
// Se mantienen el verde de éxito, el rojo de error y los colores de sintaxis.
const WARM = [
  ['rgba(90,155,255,', 'rgba(255,140,70,'], ['rgba(130,180,255,', 'rgba(255,170,120,'],
  ['rgba(140,180,255,', 'rgba(255,170,120,'], ['rgba(120,160,255,', 'rgba(255,150,100,'],
  ['rgba(47,128,255,', 'rgba(255,70,30,'],
  ['#2f80ff', '#ff6b1a'], ['#5a9bff', '#ffa94d'], ['#0d1626', '#1a100c'], ['#7d8aa5', '#a8928a'],
  ['#eaf2ff', '#fff1e8'], ['#eaf0ff', '#fff1e8'], ['#cfe0ff', '#ffd9c2'], ['#e6efff', '#fff0e6'],
  ['#9fc2ff', '#ffc29a'], ['#132038', '#2a1710'], ['#081020', '#140a07'], ['#070d1a', '#120806'],
  ['#2a3d66', '#5a2c1c'], ['#2a3550', '#4a2a20'], ['#8aa0c8', '#c8a090'], ['#9fb3d9', '#e0b8a0'],
  ['#c8d3ea', '#eed8cc'], ['#3a4a6a', '#6a4a3a'], ['#4d5d80', '#806050'], ['#5a6a88', '#8a6a5a'],
  ['#9fb0d0', '#d0b0a0'], ['#6f81a6', '#a68170'], ['#13295a', '#5a1f0d'], ['#15305f', '#6a230d'],
  ['#8fb8ff', '#ffb88f'], ['#0a1526', '#26140c'], ['#05070d', '#0a0605'], ['#aeb9d4', '#d9bfb3']
];
const warm = (s) => WARM.reduce((acc, [a, b]) => acc.split(a).join(b), s);

const beats = [
  { eyebrow: 'ANTHROPIC',    head: 'Claude <b>Opus 5.5</b>' },
  { eyebrow: 'RAZONAMIENTO', head: 'Piensa <b>paso a paso</b>' },
  { eyebrow: 'CÓDIGO',       head: 'Programa y <b>se corrige</b>' },
  { eyebrow: 'AGENTE',       head: 'Hace <b>tareas</b> por ti' },
  { eyebrow: 'MULTIMODAL',   head: 'Texto, imagen y <b>voz</b>' },
  { eyebrow: 'VELOCIDAD',    head: '<b>Modo rápido</b>' },
  { eyebrow: 'EMPIEZA',      head: 'Construye lo que <b>imaginas</b>' }
];
const GAP = 0.3;
// Duraciones con las que se ajustaron a mano las animaciones; si la escena dura
// menos, la animación se acelera en proporción para seguir cabiendo.
const DESIGN = [5.348, 6.116, 6.572, 5.708, 4.268, 4.868, 6.116];
const use = LIMIT ? beats.slice(0, LIMIT) : beats;

let cursor = 0;
const audio = [];
for (let i = 0; i < use.length; i++) {
  const meta = await media.probe(`${T}/n${i + 1}.mp3`);
  const start = Math.round(cursor * 1000) / 1000;
  use[i].start = start;
  use[i].dur = Math.round((meta.duration + GAP) * 1000) / 1000;
  let words = [];
  try { words = JSON.parse(fs.readFileSync(`${T}/n${i + 1}.words.json`, 'utf8')); } catch {}
  use[i].caps = words.map((w) => ({ t: Math.round((start + w.t) * 1000) / 1000, w: w.w }));
  audio.push({ file: `${T}/n${i + 1}.mp3`, start, volume: 1 });
  cursor += use[i].dur;
}
const total = Math.round(cursor * 1000) / 1000;

// --- Utilidades de generación ------------------------------------------------
const glow = (id, dev = 8) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${dev}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const f1 = (n) => n.toFixed(1);
const arcPath = (cx, cy, R, a0, a1) => {
  const r0 = a0 * Math.PI / 180, r1 = a1 * Math.PI / 180;
  return `M${f1(cx + R * Math.cos(r0))} ${f1(cy + R * Math.sin(r0))} A${R} ${R} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${f1(cx + R * Math.cos(r1))} ${f1(cy + R * Math.sin(r1))}`;
};
const curve = (a, b) => `M${a[0]} ${a[1]} C ${(a[0] + b[0]) / 2} ${a[1]}, ${(a[0] + b[0]) / 2} ${b[1]}, ${b[0]} ${b[1]}`;
const chip = (cls, x, y, label, w = 180) =>
  `<g class="${cls}" data-x="${x}" data-y="${y}"><rect x="${x - w / 2}" y="${y - 26}" width="${w}" height="52" rx="26" fill="${CARD}" stroke="${BLUE}" stroke-width="2.5"/><circle cx="${x - w / 2 + 26}" cy="${y}" r="6" fill="${BLUE2}"/><text x="${x + 10}" y="${y + 8}" text-anchor="middle" fill="#eaf2ff" font-size="22" font-weight="800">${label}</text></g>`;

// --- 0 HERO: núcleo HUD --------------------------------------------------------
const heroSvg = (() => {
  let dots = '';
  for (let gx = 0; gx < 18; gx++) for (let gy = 0; gy < 15; gy++) {
    const x = 45 + gx * 48, y = 12 + gy * 50, o = 0.5 - Math.hypot(x - 450, y - 360) / 560;
    if (o > 0.04) dots += `<circle cx="${x}" cy="${y}" r="2" fill="${BLUE2}" opacity="${o.toFixed(2)}"/>`;
  }
  let ticks = '';
  for (let i = 0; i < 72; i++) {
    const a = i * 5 * Math.PI / 180, l = i % 6 === 0 ? 22 : 10;
    ticks += `<line x1="${f1(450 + Math.cos(a) * 248)}" y1="${f1(360 + Math.sin(a) * 248)}" x2="${f1(450 + Math.cos(a) * (248 + l))}" y2="${f1(360 + Math.sin(a) * (248 + l))}" stroke="rgba(140,180,255,${i % 6 === 0 ? '.6' : '.28'})" stroke-width="2"/>`;
  }
  const chips = [[150, 130, 'Razona'], [750, 130, 'Programa'], [150, 600, 'Entiende'], [750, 600, 'Actúa']];
  const lines = chips.map(([x, y], k) => {
    const d = Math.hypot(x - 450, y - 360), ux = (x - 450) / d, uy = (y - 360) / d;
    return `<path class="chipl" data-k="${k}" d="M${f1(450 + ux * 105)} ${f1(360 + uy * 105)} L${x} ${y}" stroke="rgba(90,155,255,.5)" stroke-width="2" fill="none"/>`;
  }).join('');
  const parts = [0, 1, 2].map((i) => [0, 1, 2, 3, 4].map((j) =>
    `<circle class="p${i}_${j}" r="${[11, 8, 6, 4.5, 3.5][j]}" fill="${i === 1 ? '#ffffff' : BLUE2}"/>`).join('')).join('');
  return `<svg viewBox="0 0 900 720"><defs>
     <radialGradient id="h0c" cx="42%" cy="38%"><stop offset="0" stop-color="#e6efff"/><stop offset="55%" stop-color="${BLUE}"/><stop offset="100%" stop-color="#13295a"/></radialGradient>${glow('h0g', 12)}${glow('h0s', 5)}</defs>
     <g class="hgrid">${dots}</g>
     <circle class="hro" cx="450" cy="360" r="292" fill="none" stroke="${BLUE2}" stroke-width="3" stroke-dasharray="2 14" opacity=".55"/>
     <g class="hrt">${ticks}</g>
     <g class="hra" filter="url(#h0s)">
       <path d="${arcPath(450, 360, 212, 200, 262)}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/>
       <path d="${arcPath(450, 360, 212, 20, 92)}" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/>
       <path d="${arcPath(450, 360, 212, 115, 150)}" fill="none" stroke="${BLUE2}" stroke-width="3" stroke-linecap="round"/>
       <path d="${arcPath(450, 360, 186, 300, 340)}" fill="none" stroke="${BLUE2}" stroke-width="3" stroke-linecap="round"/></g>
     <g class="horb" fill="none" stroke="rgba(90,155,255,.28)" stroke-width="2">
       <ellipse cx="450" cy="360" rx="250" ry="100" transform="rotate(25 450 360)"/>
       <ellipse cx="450" cy="360" rx="250" ry="100" transform="rotate(-25 450 360)"/>
       <circle cx="450" cy="360" r="175"/></g>
     ${lines}
     <circle class="pr" cx="450" cy="360" r="95" fill="none" stroke="${BLUE}" stroke-width="3"/>
     <g class="coreG" filter="url(#h0g)"><circle cx="450" cy="360" r="92" fill="url(#h0c)"/><circle cx="426" cy="334" r="24" fill="#fff" opacity=".35"/></g>
     <g filter="url(#h0s)">${parts}</g>
     ${chips.map(([x, y, l]) => chip('chip', x, y, l)).join('')}</svg>`;
})();

// --- 1 RAZONAMIENTO: árbol de pensamiento ---------------------------------------
const reasonSvg = (() => {
  const root = [110, 380], mids = [[360, 205], [360, 380], [360, 555]],
    leaves = [[610, 140], [610, 265], [610, 350], [610, 455], [610, 560], [610, 680]],
    concl = [820, 380], leafOf = [[0, 1], [2, 3], [4, 5]], chMid = 1, chLeaf = 3,
    scores = ['41%', '58%', '63%', '96%', '37%', '52%'];
  const dim = 'rgba(90,155,255,.3)';
  let edges = '';
  mids.forEach((m, i) => { const ch = i === chMid; edges += `<path class="edge" data-l="0" data-ch="${ch ? 1 : 0}" d="${curve(root, m)}" fill="none" stroke="${ch ? BLUE : dim}" stroke-width="${ch ? 5 : 3}" stroke-linecap="round"/>`; });
  mids.forEach((m, i) => leafOf[i].forEach((li) => { const ch = i === chMid && li === chLeaf; edges += `<path class="edge" data-l="1" data-ch="${ch ? 1 : 0}" d="${curve(m, leaves[li])}" fill="none" stroke="${ch ? BLUE : dim}" stroke-width="${ch ? 5 : 3}" stroke-linecap="round"/>`; }));
  leaves.forEach((l, li) => { const ch = li === chLeaf; edges += `<path class="edge" data-l="2" data-ch="${ch ? 1 : 0}" d="${curve(l, concl)}" fill="none" stroke="${ch ? '#eaf2ff' : 'rgba(90,155,255,.2)'}" stroke-width="${ch ? 4 : 2}" stroke-linecap="round"/>`; });
  const cm = mids[chMid], cl = leaves[chLeaf], s2 = curve(cm, cl), s3 = curve(cl, concl);
  const chpath = `<path id="chpath" d="${curve(root, cm)} ${s2.slice(s2.indexOf('C'))} ${s3.slice(s3.indexOf('C'))}" fill="none" stroke="none"/>`;
  const node = (x, y, l, i, ch, r0, core) => `<g class="nd" data-l="${l}" data-i="${i}" data-ch="${ch ? 1 : 0}"><circle cx="${x}" cy="${y}" r="${r0}" fill="${ch ? 'url(#r1core)' : CARD}" stroke="${ch ? '#eaf2ff' : BLUE}" stroke-width="3" ${ch ? 'filter="url(#r1f)"' : ''}/>${core ? `<circle cx="${x}" cy="${y}" r="${core}" fill="#fff"/>` : ''}</g>`;
  let nodes = node(root[0], root[1], 0, 0, true, 34, 11);
  mids.forEach((m, i) => { nodes += node(m[0], m[1], 1, i, i === chMid, 26, 0); });
  leaves.forEach((l, i) => { nodes += node(l[0], l[1], 2, i, i === chLeaf, 19, 0); });
  nodes += node(concl[0], concl[1], 3, 0, true, 32, 0);
  const sc = leaves.map((l, i) => `<text class="score" data-ch="${i === chLeaf ? 1 : 0}" x="${l[0]}" y="${l[1] - 30}" text-anchor="middle" fill="${i === chLeaf ? '#eaf2ff' : GRAY}" font-size="${i === chLeaf ? 22 : 18}" font-weight="800">${scores[i]}</text>`).join('');
  const heads = [[110, 'PREGUNTA'], [360, 'EXPLORA'], [610, 'EVALÚA'], [820, 'RESPUESTA']]
    .map(([x, t]) => `<text class="colh" x="${x}" y="52" text-anchor="middle" fill="${BLUE2}" font-size="18" font-weight="800" letter-spacing="2">${t}</text>`).join('');
  return `<svg viewBox="0 0 900 720"><defs>${glow('r1f', 8)}
     <radialGradient id="r1core" cx="48%" cy="42%"><stop offset="0" stop-color="#eaf2ff"/><stop offset="60%" stop-color="${BLUE}"/><stop offset="100%" stop-color="#15305f"/></radialGradient></defs>
     ${heads}
     <g class="edges">${edges}</g>${chpath}
     <circle class="cburst" cx="${concl[0]}" cy="${concl[1]}" r="30" fill="none" stroke="#eaf2ff" stroke-width="3" opacity="0"/>
     <g class="nodes">${nodes}</g>${sc}
     <path class="ccheck" d="M806 381 L816 392 L836 369" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <circle class="ptr3" r="5" fill="#cfe0ff"/><circle class="ptr2" r="6.5" fill="#cfe0ff"/><circle class="ptr1" r="8" fill="#eaf2ff"/>
     <circle class="pulse" r="10" fill="#fff" filter="url(#r1f)"/></svg>`;
})();

// --- 2 CÓDIGO: editor real que se escribe, falla y se corrige ------------------
const codeSvg = (() => {
  const CC = { kw: '#c678dd', fn: '#61afef', bi: '#56b6c2', num: '#d19a66', p: '#c8d3ea' };
  const CODE = [
    [['def', 'kw'], [' ', 'p'], ['resumen', 'fn'], ['(datos):', 'p']],
    [['    total = ', 'p'], ['sum', 'bi'], ['(datos)', 'p']],
    [['    ', 'p'], ['return', 'kw'], [' total / ', 'p'], ['len', 'bi'], ['(datos', 'p']],
    [],
    [['print', 'bi'], ['(resumen([', 'p'], ['4', 'num'], [', ', 'p'], ['8', 'num'], [', ', 'p'], ['15', 'num'], [']))', 'p']]
  ];
  const BL = [168, 220, 272, 324, 376], CW = 14.29, X = 185;
  const LEN = CODE.map((toks) => toks.reduce((n, t) => n + t[0].length, 0));
  const text = CODE.map((toks, i) => `<text x="${X}" y="${BL[i]}" ${MONO} font-size="26" xml:space="preserve" style="white-space:pre">${toks.map((t) => `<tspan fill="${CC[t[1]]}">${t[0]}</tspan>`).join('')}${i === 2 ? `<tspan class="fixp" fill="#2ee88a" opacity="0">)</tspan>` : ''}</text>`).join('');
  const covers = LEN.map((n, i) => `<rect class="cov" x="${X}" y="${BL[i] - 24}" width="${f1(n * CW + 12)}" height="32" fill="${CARD}"/>`).join('');
  let sq = `M${f1(X + 19 * CW)} 280`;
  for (let x = X + 19 * CW, i = 0; x < X + 28 * CW; x += 6, i++) sq += ` L${f1(x + 6)} ${i % 2 ? 280 : 274}`;
  return `<svg viewBox="0 0 900 720"><defs>${glow('c2f', 6)}</defs>
   <g class="win">
     <rect x="110" y="70" width="680" height="490" rx="22" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
     <rect x="110" y="70" width="680" height="52" rx="22" fill="#132038"/><rect x="110" y="100" width="680" height="22" fill="#132038"/>
     <circle cx="146" cy="96" r="8" fill="#ff5f57"/><circle cx="174" cy="96" r="8" fill="#febc2e"/><circle cx="202" cy="96" r="8" fill="#28c840"/>
     <text x="450" y="103" text-anchor="middle" fill="${GRAY}" font-size="19" font-weight="700" ${MONO}>resumen.py</text>
     ${BL.map((y, i) => `<text x="150" y="${y}" text-anchor="middle" fill="#3a4a6a" font-size="22" ${MONO}>${i + 1}</text>`).join('')}
     <rect class="fixbg" x="${f1(X + 28 * CW - 2)}" y="248" width="18" height="32" rx="4" fill="#2ee88a" opacity="0"/>
     ${text}${covers}
     <path class="squig" d="${sq}" fill="none" stroke="#ff5f57" stroke-width="2.5" stroke-linejoin="round" opacity="0"/>
     <rect class="caret" x="${X}" y="146" width="3" height="28" fill="#eaf2ff"/>
     <g class="tip" opacity="0"><rect x="598" y="228" width="188" height="34" rx="8" fill="#2a0f14" stroke="#ff5f57" stroke-width="1.5"/>
       <text x="610" y="251" fill="#ffb3b0" font-size="15" font-weight="700">SyntaxError: falta ')'</text></g>
     <rect x="130" y="404" width="640" height="140" rx="12" fill="#070d1a" stroke="rgba(120,160,255,.12)" stroke-width="1.5"/>
     <text x="150" y="428" fill="#4d5d80" font-size="13" font-weight="800" letter-spacing="2">TERMINAL</text>
     <text class="t0" x="150" y="462" font-size="19" ${MONO} fill="#c8d3ea"></text>
     <text class="t1" x="150" y="492" font-size="19" ${MONO} fill="#c8d3ea"></text>
     <text class="t2" x="150" y="522" font-size="19" ${MONO} fill="#2ee88a"></text>
   </g>
   <g class="badge" transform="translate(712 250)" filter="url(#c2f)" opacity="0">
     <polygon points="0,-56 48,-28 48,28 0,56 -48,28 -48,-28" fill="rgba(46,232,138,.12)" stroke="#2ee88a" stroke-width="3"/>
     <circle class="bpulse" r="40" fill="none" stroke="#2ee88a" stroke-width="3"/>
     <circle class="bring" r="38" fill="none" stroke="#2ee88a" stroke-width="6" stroke-linecap="round" transform="rotate(-90)"/>
     <path class="bchk" d="M-19 2 L-6 17 L21 -17" fill="none" stroke="#eafff3" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
})();

// --- 3 AGENTE: usa herramientas con vista previa de cada acción -----------------
const agentSvg = (() => {
  const Y0 = [86, 281, 476];
  const conns = Y0.map((y, i) => `<path class="conn" data-k="${i}" d="${curve([226, 380], [470, y + 75])}" fill="none" stroke="rgba(90,155,255,.45)" stroke-width="3" stroke-dasharray="8 10"/>`).join('');
  const head = (y, icon, label) => `<rect class="chiprect" x="470" y="${y}" width="370" height="150" rx="18" fill="${CARD}" stroke="${BLUE}" stroke-width="2.5"/>
      <text x="500" y="${y + 39}" text-anchor="middle" font-size="24" fill="#fff">${icon}</text>
      <text x="522" y="${y + 38}" fill="#eaf2ff" font-size="23" font-weight="800">${label}</text>
      <rect x="492" y="${y + 56}" width="326" height="80" rx="10" fill="#081020"/>
      <g class="chk"><circle cx="812" cy="${y + 30}" r="15" fill="#28c840"/><path d="M805 ${y + 30} L810 ${y + 36} L820 ${y + 23}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const y0 = Y0[0], y1 = Y0[1], y2 = Y0[2];
  const web = `<g class="tool" data-k="0">${head(y0, '🌐', 'Navega la web')}
      <rect x="504" y="${y0 + 66}" width="302" height="24" rx="12" fill="#132038"/>
      <text class="wurl" x="522" y="${y0 + 83}" font-size="15" ${MONO} fill="#9fb3d9"></text>
      <rect class="wload" x="504" y="${y0 + 93}" width="0" height="3" fill="${BLUE}"/>
      ${[260, 200, 230].map((w, j) => `<rect class="wln" x="504" y="${y0 + 102 + j * 11}" width="0" height="6" rx="3" fill="rgba(255,255,255,.35)"/>`).join('')}</g>`;
  const shell = `<g class="tool" data-k="1">${head(y1, '›_', 'Ejecuta comandos')}
      <text class="scmd" x="506" y="${y1 + 84}" font-size="17" ${MONO} fill="#c8d3ea"></text>
      <text class="sout" x="506" y="${y1 + 108}" font-size="17" ${MONO} fill="#2ee88a" opacity="0">✓ 12 passed</text>
      <text class="sout2" x="506" y="${y1 + 128}" font-size="15" ${MONO} fill="#6f81a6" opacity="0">listo en 1.2s</text></g>`;
  const files = `<g class="tool" data-k="2">${head(y2, '🗎', 'Edita archivos')}
      <rect class="fhl" x="500" y="${y2 + 96}" width="0" height="16" rx="4" fill="rgba(254,188,46,.35)"/>
      ${[250, 180, 220, 140].map((w, j) => `<rect x="506" y="${y2 + 68 + j * 16}" width="${w}" height="8" rx="4" fill="${j === 2 ? 'rgba(46,232,138,.55)' : 'rgba(255,255,255,.3)'}"/>`).join('')}
      <text class="ftag" x="790" y="${y2 + 110}" text-anchor="end" font-size="13" font-weight="800" fill="#2ee88a" opacity="0">EDITADO</text></g>`;
  return `<svg viewBox="0 0 900 720"><defs>${glow('a3f', 7)}</defs>
     <text class="acount" x="470" y="56" fill="${BLUE2}" font-size="19" font-weight="800" letter-spacing="3">TAREAS 0/3</text>
     <rect x="640" y="44" width="200" height="10" rx="5" fill="rgba(255,255,255,.1)"/>
     <rect class="abar" x="640" y="44" width="0" height="10" rx="5" fill="${BLUE}"/>
     ${conns}${web}${shell}${files}
     <circle class="aring" cx="160" cy="380" r="84" fill="none" stroke="${BLUE2}" stroke-width="3" stroke-dasharray="14 12"/>
     <g class="agent" filter="url(#a3f)"><circle cx="160" cy="380" r="62" fill="${BLUE}"/><circle cx="160" cy="380" r="62" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>
       <circle cx="143" cy="370" r="9" fill="#fff"/><circle cx="177" cy="370" r="9" fill="#fff"/><rect x="141" y="392" width="38" height="7" rx="3.5" fill="#fff"/></g>
     <text x="160" y="498" text-anchor="middle" fill="${BLUE2}" font-size="22" font-weight="800">Agente</text>
     <circle class="pk2" r="5" fill="#cfe0ff"/><circle class="pk1" r="7" fill="#eaf2ff"/><circle class="pkt" r="9" fill="#fff" filter="url(#a3f)"/></svg>`;
})();

// --- 4 MULTIMODAL: entradas vivas -> red neuronal -> comprensión ----------------
const multiSvg = (() => {
  const C = [470, 360];
  const N = [[-60, -40], [-20, -70], [35, -55], [70, -10], [50, 45], [5, 70], [-45, 55], [-75, 10], [-10, -5], [25, 20]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [8, 0], [8, 2], [8, 9], [9, 4], [9, 3], [8, 6], [1, 8], [9, 5]];
  const flowsTo = [[230, 170], [230, 345], [230, 525]];
  const flows = flowsTo.map((p, i) => `<path class="flow" d="${curve(p, [372, 360])}" fill="none" stroke="rgba(90,155,255,.45)" stroke-width="3" stroke-dasharray="4 10"/>`).join('');
  const fps = flowsTo.map((p, f) => [0, 1, 2].map((j) => `<circle class="fp" data-f="${f}" data-j="${j}" r="5" fill="#eaf2ff"/>`).join('')).join('');
  return `<svg viewBox="0 0 900 720"><defs>${glow('m4f', 9)}<clipPath id="m4clip"><rect x="58" y="318" width="154" height="66" rx="8"/></clipPath></defs>
     ${flows}${fps}
     <g class="in" data-k="0"><rect x="40" y="120" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="142" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">TEXTO</text>
       <text x="60" y="166" fill="${BLUE2}" font-size="24" font-weight="800">Aa</text>
       <rect x="60" y="178" width="150" height="8" rx="4" fill="#fff"/><rect x="60" y="193" width="120" height="8" rx="4" fill="rgba(255,255,255,.5)"/><rect x="60" y="207" width="90" height="8" rx="4" fill="rgba(255,255,255,.35)"/></g>
     <g class="in" data-k="1"><rect x="40" y="295" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="313" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">IMAGEN</text>
       <g clip-path="url(#m4clip)"><rect x="58" y="318" width="154" height="66" fill="#0a1526"/><circle cx="90" cy="338" r="10" fill="#febc2e"/>
         <path d="M58 384 L105 340 L140 370 L168 348 L212 384 Z" fill="${BLUE2}"/>
         <rect class="iscan" x="58" y="318" width="154" height="3" fill="#eaf2ff" opacity=".85"/></g></g>
     <g class="in" data-k="2"><rect x="40" y="475" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="493" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">VOZ</text>
       <circle cx="72" cy="532" r="15" fill="${BLUE}"/><rect x="68" y="522" width="8" height="16" rx="4" fill="#fff"/>
       ${[0, 1, 2, 3, 4, 5, 6, 7].map((j) => `<rect class="wbar" x="${100 + j * 14}" y="520" width="8" height="24" rx="4" fill="${BLUE2}"/>`).join('')}</g>
     <g class="brain">
       <circle cx="${C[0]}" cy="${C[1]}" r="100" fill="rgba(47,128,255,.10)" stroke="${BLUE2}" stroke-width="2"/>
       <circle class="bring2" cx="${C[0]}" cy="${C[1]}" r="122" fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 10"/>
       ${E.map(([a, b]) => `<line class="be" x1="${C[0] + N[a][0]}" y1="${C[1] + N[a][1]}" x2="${C[0] + N[b][0]}" y2="${C[1] + N[b][1]}" stroke="#9fc2ff" stroke-width="2"/>`).join('')}
       <g filter="url(#m4f)">${N.map(([x, y], k) => `<circle class="bn" data-k="${k}" cx="${C[0] + x}" cy="${C[1] + y}" r="6" fill="#2a3d66"/>`).join('')}
       <circle cx="${C[0]}" cy="${C[1]}" r="12" fill="${BLUE}"/></g></g>
     <path class="oflow" d="${curve([572, 360], [640, 360])}" fill="none" stroke="rgba(90,155,255,.5)" stroke-width="3" stroke-dasharray="4 10"/>
     <circle class="op" r="5" fill="#eaf2ff"/><circle class="op" r="5" fill="#eaf2ff"/>
     <g class="out"><rect x="640" y="225" width="225" height="270" rx="18" fill="${CARD}" stroke="${BLUE}" stroke-width="2.5"/>
       <text x="662" y="266" fill="#fff" font-size="23" font-weight="800">Comprensión</text>
       ${['Texto', 'Imagen', 'Voz'].map((t, k) => `<g class="orow"><circle cx="674" cy="${304 + k * 44}" r="12" fill="#28c840"/><path d="M668 ${304 + k * 44} L672 ${309 + k * 44} L680 ${298 + k * 44}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><text x="696" y="${311 + k * 44}" fill="#eaf2ff" font-size="20" font-weight="700">${t}</text></g>`).join('')}
       <g class="orow"><rect x="662" y="440" width="180" height="34" rx="17" fill="${BLUE}"/><text x="752" y="463" text-anchor="middle" fill="#fff" font-size="17" font-weight="800">Respuesta lista</text></g></g></svg>`;
})();

// --- 5 VELOCIDAD: demo del toggle + comparativa ---------------------------------
const speedSvg = `<svg viewBox="0 0 900 720"><defs>${glow('s5f', 7)}</defs>
   <g class="vcard">
     <rect x="150" y="120" width="600" height="490" rx="26" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
     <text x="190" y="190" fill="#fff" font-size="34" font-weight="800">Modo rápido</text>
     <text x="190" y="220" fill="${GRAY}" font-size="18">Respuestas al instante</text>
     <rect class="track" x="596" y="166" width="114" height="54" rx="27" fill="#2a3550"/>
     <circle class="ripple" cx="653" cy="193" r="10" fill="none" stroke="${BLUE2}" stroke-width="3" opacity="0"/>
     <circle class="knob" cx="623" cy="193" r="23" fill="#8aa0c8"/>
     <text x="190" y="275" fill="${GRAY}" font-size="17" font-weight="800" letter-spacing="3">RESPUESTA</text>
     <text class="tps" x="600" y="275" text-anchor="end" fill="#2ee88a" font-size="18" font-weight="800" opacity="0">0 tok/s</text>
     ${[0, 1, 2].map((i) => `<rect class="rln" x="190" y="${292 + i * 38}" width="0" height="24" rx="9" fill="${BLUE}"/>`).join('')}
     <rect class="shim" x="190" y="288" width="70" height="108" fill="#fff" opacity="0"/>
     <g class="bolt" filter="url(#s5f)" opacity="0"><path d="M680 270 L645 350 L680 350 L655 425 L732 330 L690 330 Z" fill="${BLUE}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>
     <g class="cmp">
       <text x="190" y="455" fill="${GRAY}" font-size="15" font-weight="800" letter-spacing="3">COMPARATIVA</text>
       <text x="190" y="494" fill="#9fb0d0" font-size="18" font-weight="700">Normal</text>
       <rect x="290" y="481" width="350" height="16" rx="8" fill="rgba(255,255,255,.08)"/>
       <rect class="cmpn" x="290" y="481" width="0" height="16" rx="8" fill="#5a6a88"/>
       <text class="cmpnt" x="652" y="494" fill="#9fb0d0" font-size="17" font-weight="700">0.0s…</text>
       <text x="190" y="540" fill="#fff" font-size="18" font-weight="800">Rápido</text>
       <rect x="290" y="527" width="350" height="16" rx="8" fill="rgba(255,255,255,.08)"/>
       <rect class="cmpf" x="290" y="527" width="0" height="16" rx="8" fill="${BLUE}"/>
       <text class="cmpft" x="652" y="540" fill="#2ee88a" font-size="17" font-weight="800" opacity="0">0.3s ✓</text></g>
   </g>
   <g class="cursor"><path d="M0 0 L0 32 L9 24 L15 36 L22 33 L14 21 L26 21 Z" fill="#fff" stroke="#0a1526" stroke-width="2"/></g></svg>`;

// --- 6 CONSTRUIR: plano -> wireframe -> bloques ---------------------------------
const buildSvg = (() => {
  let grid = '';
  for (let x = 60; x <= 840; x += 40) grid += `<line x1="${x}" y1="60" x2="${x}" y2="680" stroke="rgba(90,155,255,.13)" stroke-width="1"/>`;
  for (let y = 60; y <= 680; y += 40) grid += `<line x1="60" y1="${y}" x2="840" y2="${y}" stroke="rgba(90,155,255,.13)" stroke-width="1"/>`;
  const FIN = [[334, 520], [450, 520], [566, 520], [392, 424], [508, 424], [450, 328]];
  const HW = 58, TH = 33, SH = 96;
  const faces = (x, y) => ({
    top: `${x - HW},${y} ${x},${y - TH} ${x + HW},${y} ${x},${y + TH}`,
    left: `${x - HW},${y} ${x},${y + TH} ${x},${y + TH + SH} ${x - HW},${y + SH}`,
    right: `${x + HW},${y} ${x},${y + TH} ${x},${y + TH + SH} ${x + HW},${y + SH}`
  });
  const cols = [BLUE, BLUE2, BLUE, BLUE2, BLUE, '#8fb8ff'];
  const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')).join(''); };
  const edge = 'stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-linejoin="round"';
  const wire = FIN.map(([x, y]) => { const f = faces(x, y); return ['top', 'left', 'right'].map((k) => `<polygon class="wf" points="${f[k]}" fill="none" stroke="rgba(130,180,255,.75)" stroke-width="1.6"/>`).join(''); }).join('');
  const blocks = FIN.map(([x, y], i) => { const f = faces(x, y); return `<g class="blk"><polygon points="${f.left}" fill="${shade(warm(cols[i]), 0.62)}" ${edge}/><polygon points="${f.right}" fill="${shade(warm(cols[i]), 0.42)}" ${edge}/><polygon points="${f.top}" fill="${cols[i]}" ${edge}/><polygon class="bsh" points="${f.top}" fill="#fff" opacity="0"/></g>`; }).join('');
  const chips = [[140, 200, 'Apps'], [760, 200, 'Webs'], [140, 600, 'Juegos'], [760, 600, 'Agentes']];
  const cl = chips.map(([x, y]) => `<path class="bcl" d="M450 470 L${x} ${y}" stroke="rgba(90,155,255,.45)" stroke-width="2" fill="none"/>`).join('');
  return `<svg viewBox="0 0 900 720"><defs>${glow('b6f', 7)}</defs>
     <g class="bpgrid">${grid}</g>
     <g class="wire">${wire}</g>${cl}
     ${blocks}
     ${[0, 1, 2, 3, 4, 5, 6, 7].map(() => `<line class="ray" stroke="#eaf2ff" stroke-width="3" stroke-linecap="round" opacity="0"/>`).join('')}
     <g class="star" filter="url(#b6f)" opacity="0"><path d="M0 -42 L12 -13 L44 -13 L18 8 L28 40 L0 21 L-28 40 L-18 8 L-44 -13 L-12 -13 Z" fill="#fff" transform="translate(450 230)"/></g>
     ${chips.map(([x, y, l]) => chip('bchip', x, y, l, 170)).join('')}</svg>`;
})();

const SVGS = [heroSvg, reasonSvg, codeSvg, agentSvg, multiSvg, speedSvg, buildSvg];

// --- Animadores (corren en la página; sin template literals) --------------------
const ANIM = `
const easeBack=x=>{x=clamp(x,0,1);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
function ell(cx,cy,rx,ry,deg,a){const r=deg*Math.PI/180,x=rx*Math.cos(a),y=ry*Math.sin(a);return [cx+x*Math.cos(r)-y*Math.sin(r), cy+x*Math.sin(r)+y*Math.cos(r)];}
function tf(r,sel,t){const e=r.querySelector(sel);if(e)e.setAttribute('transform',t);}
function sc(n,x,y,s){n.setAttribute('transform','translate('+x+' '+y+') scale('+s+') translate('+(-x)+' '+(-y)+')');}
function cxy(e,x,y){if(e){e.setAttribute('cx',x);e.setAttribute('cy',y);}}
function reveal(el,p){if(!el)return;const L=el.getTotalLength();el.setAttribute('stroke-dasharray',L);el.setAttribute('stroke-dashoffset',L*(1-clamp(p,0,1)));}
function fmt(n){return n>=1000?Math.floor(n/1000)+'.'+String(n%1000).padStart(3,'0'):String(n);}
const DIAGRAMS={
 0:(lt,dur,r)=>{const In=easeOut(lt/0.6);
   r.querySelector('.hgrid').style.opacity=In;
   tf(r,'.hro','rotate('+(lt*10)+' 450 360)');tf(r,'.hrt','rotate('+(-lt*16)+' 450 360)');tf(r,'.hra','rotate('+(lt*38)+' 450 360)');
   ['.hro','.hrt','.hra','.horb'].forEach(s=>{r.querySelector(s).style.opacity=In;});
   sc(r.querySelector('.coreG'),450,360,easeBack(lt/0.7)*(1+0.04*Math.sin(lt*3)));
   const pr=r.querySelector('.pr'),rr=95+((lt*120)%200);pr.setAttribute('r',rr);pr.style.opacity=(1-(rr-95)/200)*0.7*In;
   const P=[[250,100,25,1.5,0],[250,100,-25,-1.8,1.2],[175,175,0,2.4,2.5]];
   P.forEach((q,i)=>{for(let j=0;j<5;j++){const p=ell(450,360,q[0],q[1],q[2],lt*q[3]+q[4]-j*0.09*Math.sign(q[3]));const e=r.querySelector('.p'+i+'_'+j);cxy(e,p[0],p[1]);if(e)e.style.opacity=In*(1-j*0.18);}});
   r.querySelectorAll('.chipl').forEach((l,k)=>{reveal(l,(lt-0.9-k*0.3)/0.4);});
   r.querySelectorAll('.chip').forEach((c,k)=>{const a=clamp((lt-1.0-k*0.3)/0.4,0,1);c.style.opacity=a;sc(c,+c.getAttribute('data-x'),+c.getAttribute('data-y'),0.6+0.4*easeBack(a));});},
 1:(lt,dur,r)=>{const dec=2.7,dimA=clamp((lt-dec)/0.4,0,1);
   r.querySelectorAll('.colh').forEach((h,k)=>{h.style.opacity=clamp((lt-0.1-k*0.45)/0.4,0,1);});
   r.querySelectorAll('.edge').forEach((e)=>{const lv=+e.getAttribute('data-l');const st=lv===0?0.25:(lv===1?0.8:1.35);reveal(e,(lt-st)/0.55);const ch=e.getAttribute('data-ch')==='1';e.style.opacity=ch?1:(1-0.7*dimA);if(ch&&lv<2)e.setAttribute('stroke-width',(5+2*dimA).toFixed(2));});
   r.querySelectorAll('.nd').forEach((n)=>{const lv=+n.getAttribute('data-l'),ix=+n.getAttribute('data-i');const a=clamp((lt-(0.1+lv*0.5+ix*0.07))/0.3,0,1);const c=n.querySelector('circle');sc(n,+c.getAttribute('cx'),+c.getAttribute('cy'),easeBack(a));const ch=n.getAttribute('data-ch')==='1';n.style.opacity=clamp(a*1.6,0,1)*(ch?1:(1-0.6*dimA));});
   r.querySelectorAll('.score').forEach((s,k)=>{const a=clamp((lt-1.25-k*0.07)/0.3,0,1);const ch=s.getAttribute('data-ch')==='1';s.style.opacity=a*(ch?1:(1-0.6*dimA));});
   const cp=r.querySelector('#chpath');if(cp){const L=cp.getTotalLength();const prog=lt<3.1?clamp((lt-1.9)/1.2,0,1):((lt-3.1)*0.45)%1;
     for(let j=0;j<4;j++){const e=r.querySelector(j===0?'.pulse':'.ptr'+j);if(!e)continue;const pt=cp.getPointAtLength(L*clamp(prog-j*0.025,0,1));cxy(e,pt.x,pt.y);e.style.opacity=(lt>1.9?1:0)*(1-j*0.22);}}
   reveal(r.querySelector('.ccheck'),(lt-3.1)/0.35);
   const cb=r.querySelector('.cburst'),b=clamp((lt-3.1)/0.6,0,1);cb.setAttribute('r',32+b*70);cb.style.opacity=(b>0&&b<1)?(1-b):0;},
 2:(lt,dur,r)=>{const win=r.querySelector('.win');sc(win,450,315,0.92+0.08*easeOut(lt/0.4));win.style.opacity=easeOut(lt/0.3);
   const CW=14.29,X=185,LEN=[19,22,28,0,26],TS=[0.4,0.95,1.5,0,2.25],SP=0.025,BL=[168,220,272,324,376],fixT=3.8;
   let cx=X,cy=168;
   r.querySelectorAll('.cov').forEach((c,k)=>{const len=LEN[k];if(!len){c.setAttribute('width',0);return;}const typed=Math.floor(clamp((lt-TS[k])/(len*SP),0,1)*len);c.setAttribute('x',X+typed*CW);c.setAttribute('width',typed<len?(len-typed)*CW+12:0);if(lt>=TS[k]&&lt<TS[k]+len*SP+0.05){cx=X+typed*CW;cy=BL[k];}});
   if(lt>=TS[4]+26*SP){cx=lt>fixT?X+29*CW:X+26*CW;cy=lt>fixT?272:376;}
   const car=r.querySelector('.caret');car.setAttribute('x',cx);car.setAttribute('y',cy-22);car.style.opacity=(Math.floor(lt*2.5)%2)?0.15:1;
   const errOut=clamp((lt-fixT)/0.25,0,1);
   const sq=r.querySelector('.squig');reveal(sq,(lt-2.2)/0.35);sq.style.opacity=clamp((lt-2.2)/0.1,0,1)*(1-errOut);
   const tA=clamp((lt-2.4)/0.25,0,1),tip=r.querySelector('.tip');tip.style.opacity=tA*(1-errOut);tip.setAttribute('transform','translate(0 '+((1-tA)*8)+')');
   const fp=clamp((lt-fixT)/0.2,0,1);r.querySelector('.fixp').style.opacity=fp;r.querySelector('.fixbg').style.opacity=fp*(1-clamp((lt-fixT-0.3)/0.6,0,1))*0.7;
   const t0=r.querySelector('.t0'),t1=r.querySelector('.t1'),t2=r.querySelector('.t2'),cmd='$ python resumen.py';
   const typed=(s)=>cmd.slice(0,Math.floor(clamp((lt-s)/0.4,0,1)*cmd.length));
   if(lt<fixT){t0.textContent=typed(2.9);t1.textContent=lt>3.3?"SyntaxError: '(' was never closed":'';t1.setAttribute('fill','#ff6b6b');t2.textContent='';}
   else{t0.textContent=typed(fixT+0.15);t1.textContent=lt>fixT+0.6?'9.0':'';t1.setAttribute('fill','#ffffff');t2.textContent=lt>fixT+0.85?'✓ 12 tests passed':'';}
   const fixed=clamp((lt-(fixT+0.7))/0.5,0,1),bd=r.querySelector('.badge');
   bd.setAttribute('transform','translate(712 250) scale('+(0.6+0.4*easeBack(fixed))+')');bd.style.opacity=clamp(fixed*2.2,0,1);
   reveal(r.querySelector('.bring'),fixed/0.6);reveal(r.querySelector('.bchk'),(fixed-0.5)/0.4);
   const bp=r.querySelector('.bpulse'),pe=clamp((fixed-0.7)/0.3,0,1);bp.setAttribute('transform','scale('+(1+pe*0.9)+')');bp.style.opacity=(1-pe)*0.7;},
 3:(lt,dur,r)=>{sc(r.querySelector('.agent'),160,380,easeBack(lt/0.5)*(1+0.04*Math.sin(lt*4)));
   const sd=(dur-1.5)/3,Y0=[86,281,476],busy=lt>0.6&&lt<0.6+3*sd;
   const k=Math.max(0,Math.min(2,Math.floor((lt-0.6)/sd))),sp=clamp((lt-(0.6+k*sd))/sd,0,1);
   tf(r,'.aring','rotate('+(lt*120)+' 160 380)');r.querySelector('.aring').style.opacity=busy?0.9:0.25;
   r.querySelectorAll('.conn').forEach((c,i)=>{c.setAttribute('stroke-dashoffset',-(lt*60)%18);c.style.opacity=(i===k&&busy)?1:0.4;});
   let done=0;
   r.querySelectorAll('.tool').forEach((t,i)=>{t.style.opacity=clamp((lt-0.25-i*0.15)/0.3,0,1);
     const t0=0.6+i*sd,s=clamp((lt-t0)/sd,0,1),active=lt>=t0&&lt<t0+sd,rect=t.querySelector('.chiprect');
     rect.setAttribute('stroke',active?'#eaf2ff':'${BLUE}');rect.setAttribute('stroke-width',active?4:2.5);
     const p=clamp((s-0.2)/0.5,0,1),cp=clamp((s-0.72)/0.25,0,1);if(cp>0.5)done++;
     const chk=t.querySelector('.chk');sc(chk,812,Y0[i]+30,easeBack(cp));chk.style.opacity=cp;
     if(i===0){const u='docs.anthropic.com';t.querySelector('.wurl').textContent=u.slice(0,Math.floor(clamp(p/0.5,0,1)*u.length));t.querySelector('.wload').setAttribute('width',302*clamp((p-0.3)/0.4,0,1));t.querySelectorAll('.wln').forEach((l,j)=>{l.setAttribute('width',[260,200,230][j]*easeOut((p-0.6-j*0.1)/0.3));});}
     if(i===1){const c='$ npm test';t.querySelector('.scmd').textContent=c.slice(0,Math.floor(clamp(p/0.45,0,1)*c.length));t.querySelector('.sout').style.opacity=clamp((p-0.6)/0.15,0,1);t.querySelector('.sout2').style.opacity=clamp((p-0.8)/0.15,0,1);}
     if(i===2){const hl=t.querySelector('.fhl');hl.setAttribute('width',236*easeOut(p/0.6));hl.style.opacity=1-clamp((p-0.8)/0.2,0,1)*0.6;t.querySelector('.ftag').style.opacity=clamp((p-0.75)/0.2,0,1);}});
   r.querySelector('.acount').textContent='TAREAS '+done+'/3';r.querySelector('.abar').setAttribute('width',200*done/3);
   const conn=r.querySelectorAll('.conn')[k];if(conn){const L=conn.getTotalLength();
     for(let j=0;j<3;j++){const ss=clamp(sp-j*0.03,0,1);const pr=ss<0.4?ss/0.4:(ss<0.6?1:1-(ss-0.6)/0.4);const pt=conn.getPointAtLength(L*clamp(pr,0,1));const e=r.querySelector(j===0?'.pkt':'.pk'+j);cxy(e,pt.x,pt.y);e.style.opacity=(busy?1:0)*(1-j*0.3);}}},
 4:(lt,dur,r)=>{
   r.querySelectorAll('.in').forEach((n,k)=>{const a=clamp((lt-0.1-k*0.15)/0.35,0,1);n.style.opacity=a;n.setAttribute('transform','translate('+((1-easeOut(a))*-50)+' 0)');});
   r.querySelector('.iscan').setAttribute('y',318+((lt*60)%64));
   r.querySelectorAll('.wbar').forEach((b,j)=>{const h=10+20*Math.abs(Math.sin(lt*7+j*0.9));b.setAttribute('height',h);b.setAttribute('y',532-h/2);});
   const flows=r.querySelectorAll('.flow');flows.forEach((f,k)=>{f.style.opacity=clamp((lt-0.45-k*0.12)/0.3,0,1);f.setAttribute('stroke-dashoffset',-(lt*50)%14);});
   r.querySelectorAll('.fp').forEach((p)=>{const f=+p.getAttribute('data-f'),j=+p.getAttribute('data-j');const path=flows[f];const L=path.getTotalLength();const ph=((lt*0.9)+j/3)%1;const pt=path.getPointAtLength(L*ph);cxy(p,pt.x,pt.y);p.style.opacity=clamp((lt-0.55-f*0.12)/0.3,0,1)*Math.sin(ph*Math.PI);});
   sc(r.querySelector('.brain'),470,360,easeBack(clamp((lt-0.3)/0.5,0,1)));
   tf(r,'.bring2','rotate('+(lt*60)+' 470 360)');
   r.querySelectorAll('.bn').forEach((n,k)=>{const a=clamp((lt-0.8-k*0.12)/0.25,0,1);n.setAttribute('fill',a>0.5?'#e6efff':'#2a3d66');n.setAttribute('r',6+3*a);});
   r.querySelectorAll('.be').forEach((e,k)=>{e.style.opacity=0.12+0.6*clamp((lt-0.9-k*0.08)/0.3,0,1);});
   const oa=clamp((lt-1.8)/0.4,0,1),o=r.querySelector('.out');o.style.opacity=oa;o.setAttribute('transform','translate('+((1-easeOut(oa))*40)+' 0)');
   r.querySelectorAll('.orow').forEach((w,k)=>{w.style.opacity=clamp((lt-2.1-k*0.2)/0.25,0,1);});
   const of=r.querySelector('.oflow');of.style.opacity=oa;of.setAttribute('stroke-dashoffset',-(lt*50)%14);
   r.querySelectorAll('.op').forEach((p,j)=>{const L=of.getTotalLength();const ph=((lt*1.1)+j/2)%1;const pt=of.getPointAtLength(L*ph);cxy(p,pt.x,pt.y);p.style.opacity=oa*Math.sin(ph*Math.PI);});},
 5:(lt,dur,r)=>{const tF=1.0;r.querySelector('.vcard').style.opacity=easeOut(lt/0.3);
   const cur=r.querySelector('.cursor'),cp=easeOut(clamp(lt/tF,0,1));
   const cx=240+(640-240)*cp,cy=560-(560-202)*cp,click=(lt>tF-0.12&&lt<tF+0.1)?0.8:1;
   cur.setAttribute('transform','translate('+cx+' '+cy+') scale('+(1.5*click)+')');cur.style.opacity=lt<tF+0.7?1:clamp(1-(lt-tF-0.7)/0.3,0,1);
   const rp=r.querySelector('.ripple'),rb=clamp((lt-tF)/0.5,0,1);rp.setAttribute('r',10+rb*60);rp.style.opacity=(rb>0&&rb<1)?(1-rb)*0.8:0;
   const on=clamp((lt-tF)/0.22,0,1),knob=r.querySelector('.knob');knob.setAttribute('cx',623+60*on);knob.setAttribute('fill',on>0.5?'#fff':'#8aa0c8');
   r.querySelector('.track').setAttribute('fill',on>0.5?'${BLUE}':'#2a3550');
   const W=[400,330,370];r.querySelectorAll('.rln').forEach((ln,k)=>{ln.setAttribute('width',W[k]*easeOut(clamp((lt-(tF+0.25)-k*0.08)/0.2,0,1)));});
   const sv=clamp((lt-tF-0.6)/1.0,0,1),sh=r.querySelector('.shim');sh.setAttribute('x',190+sv*360);sh.style.opacity=(sv>0&&sv<1)?0.18:0;
   const tp=r.querySelector('.tps');tp.textContent=fmt(Math.round(1240*easeOut(clamp((lt-tF-0.2)/0.8,0,1))))+' tok/s';tp.style.opacity=on;
   r.querySelector('.bolt').style.opacity=on*(0.55+0.45*Math.abs(Math.sin(lt*9)));
   r.querySelector('.cmp').style.opacity=clamp((lt-0.2)/0.4,0,1);
   const nP=clamp((lt-0.3)/(dur-0.6),0,1)*0.55;r.querySelector('.cmpn').setAttribute('width',350*nP);r.querySelector('.cmpnt').textContent=(nP*14.9).toFixed(1)+'s…';
   const fP=clamp((lt-tF-0.2)/0.25,0,1);r.querySelector('.cmpf').setAttribute('width',350*easeOut(fP));r.querySelector('.cmpft').style.opacity=fP;},
 6:(lt,dur,r)=>{r.querySelector('.bpgrid').style.opacity=easeOut(lt/0.5);
   r.querySelectorAll('.wf').forEach((w,k)=>{reveal(w,(lt-0.3-k*0.03)/0.6);w.style.opacity=1-clamp((lt-2.6)/0.5,0,1)*0.8;});
   r.querySelectorAll('.blk').forEach((bl,k)=>{const a=clamp((lt-1.0-k*0.22)/0.5,0,1);bl.style.opacity=clamp(a*2,0,1);bl.setAttribute('transform','translate(0 '+((1-easeBack(a))*-260)+')');});
   r.querySelectorAll('.bsh').forEach((s,k)=>{const v=clamp(1-Math.abs(lt-(2.9+k*0.08))/0.18,0,1);s.style.opacity=v*0.55;});
   const st=clamp((lt-3.0)/0.45,0,1),star=r.querySelector('.star');sc(star,450,230,easeBack(st)*(1+0.08*Math.sin(lt*6)));star.style.opacity=st;
   r.querySelectorAll('.ray').forEach((ry,k)=>{const b=clamp((lt-3.05)/0.6,0,1),a=k*Math.PI/4,r1=50+b*40,r2=60+b*80;ry.setAttribute('x1',450+Math.cos(a)*r1);ry.setAttribute('y1',230+Math.sin(a)*r1);ry.setAttribute('x2',450+Math.cos(a)*r2);ry.setAttribute('y2',230+Math.sin(a)*r2);ry.style.opacity=(b>0&&b<1)?(1-b):0;});
   r.querySelectorAll('.bcl').forEach((l,k)=>{reveal(l,(lt-3.3-k*0.18)/0.35);});
   r.querySelectorAll('.bchip').forEach((c,k)=>{const a=clamp((lt-3.4-k*0.18)/0.35,0,1);c.style.opacity=a;sc(c,+c.getAttribute('data-x'),+c.getAttribute('data-y'),0.6+0.4*easeBack(a));});}
};
`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:#05070d;font-family:'Segoe UI',system-ui,sans-serif}
#bg{position:absolute;inset:0;background:radial-gradient(1200px 700px at 60% 118%, rgba(47,128,255,.22), transparent 60%);}
#brand{position:absolute;top:60px;left:110px;display:flex;align-items:center;gap:16px;z-index:3}
#brand .sq{width:46px;height:46px;border-radius:12px;background:${BLUE};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:26px}
#brand .t{color:#eaf0ff;font-weight:800;font-size:28px}
#wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 110px}
#left{width:44%}
#eyebrow{display:flex;align-items:center;gap:14px;color:${BLUE2};font-weight:800;font-size:26px;letter-spacing:8px;margin-bottom:26px}
#eyebrow .dot{width:12px;height:12px;border-radius:50%;background:${BLUE}}
#head{color:#fff;font-weight:800;font-size:92px;line-height:1.04;letter-spacing:-1px}
#head b{color:${BLUE}}
#right{flex:1;display:flex;justify-content:center;align-items:center}
#art{width:820px;height:660px;position:relative}
.diagram{position:absolute;inset:0;opacity:0}.diagram svg{width:820px;height:660px;display:block;font-family:'Segoe UI',system-ui,sans-serif}
#caps{position:absolute;bottom:120px;left:0;right:0;text-align:center;font-weight:800;font-size:44px;z-index:3}
.cap{display:inline-block;margin:0 5px;color:#aeb9d4;padding:3px 6px}
.cap.act{background:${BLUE};color:#fff;border-radius:14px;padding:3px 18px}
#bar{position:absolute;left:0;bottom:0;height:10px;width:100%;background:rgba(255,255,255,.07)}
#barfill{height:100%;width:0;background:${BLUE}}
</style></head><body>
<div id="bg"></div>
<div id="brand"><div class="sq">C</div><div class="t">Claude · Opus 5.5</div></div>
<div id="wrap">
  <div id="left"><div id="eyebrow"><span class="dot"></span><span id="ebtext"></span></div><div id="head"></div></div>
  <div id="right"><div id="art">${SVGS.slice(0, use.length).map((s, i) => `<div class="diagram" data-i="${i}">${s}</div>`).join('')}</div></div>
</div>
<div id="caps"></div>
<div id="bar"><div id="barfill"></div></div>
<script>
const BEATS=${JSON.stringify(use)};const TOTAL=${total};const DESIGN=${JSON.stringify(DESIGN)};
const ebt=document.getElementById('ebtext'),head=document.getElementById('head'),left=document.getElementById('left'),
 capsEl=document.getElementById('caps'),elBar=document.getElementById('barfill'),diags=[...document.querySelectorAll('.diagram')];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),easeOut=x=>1-Math.pow(1-clamp(x,0,1),3);
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
${ANIM}
let cur=-1;
function buildHead(i){cur=i;ebt.textContent=BEATS[i].eyebrow;head.innerHTML=BEATS[i].head;}
function renderCaps(i,t){const caps=BEATS[i].caps;if(!caps||!caps.length){capsEl.innerHTML='';return;}
  let ai=-1;for(let k=0;k<caps.length;k++){if(caps[k].t<=t+0.02)ai=k;else break;}
  if(ai<0){capsEl.innerHTML='';return;}
  const lo=Math.max(0,ai-2),hi=Math.min(caps.length-1,ai+3);let h='';
  for(let k=lo;k<=hi;k++){h+='<span class="cap'+(k===ai?' act':'')+'">'+esc(caps[k].w)+'</span>';}
  capsEl.innerHTML=h;}
window.seek=function(t){
  elBar.style.width=clamp(t/TOTAL,0,1)*100+'%';
  let idx=-1;for(let i=0;i<BEATS.length;i++){if(t>=BEATS[i].start&&t<BEATS[i].start+BEATS[i].dur){idx=i;break;}}
  diags.forEach((d,i)=>{if(i!==idx)d.style.opacity=0;});
  if(idx<0){left.style.opacity=0;capsEl.innerHTML='';return;}
  if(idx!==cur)buildHead(idx);
  const b=BEATS[idx],lt=t-b.start,inA=easeOut(lt/0.4),outA=easeOut((b.dur-lt)/0.45),beatA=clamp(Math.min(inA,outA),0,1);
  left.style.opacity=beatA;left.style.transform='translateY('+(1-inA)*26+'px)';
  diags[idx].style.opacity=beatA;
  const dd=DESIGN[idx]||b.dur,k=dd/b.dur;
  try{DIAGRAMS[idx](lt*k,dd,diags[idx]);}catch(e){window.__err=String(e&&e.stack||e);}
  renderCaps(idx,t);capsEl.style.opacity=beatA;
};
window.seek(0);
</script></body></html>`;

fs.writeFileSync(SCENE, warm(html), 'utf8');

if (SNAP) {
  // Dos momentos por escena: a mitad y casi al final
  const snaps = [];
  use.forEach((b, i) => {
    snaps.push({ t: Math.round((b.start + b.dur * 0.45) * 100) / 100, out: `${T}/s${i + 1}a.png` });
    snaps.push({ t: Math.round((b.start + b.dur * 0.88) * 100) / 100, out: `${T}/s${i + 1}b.png` });
  });
  fs.writeFileSync(T + '/job_snap.json', JSON.stringify({ html: SCENE, width: 1920, height: 1080, fps: 30, duration: total, snapshots: snaps }));
  console.log('SNAP', snaps.length);
} else {
  const job = { html: SCENE, width: 1920, height: 1080, fps: 30, duration: total,
    output: LIMIT ? (T + '/opus_test.mp4') : path.join(os.homedir(), 'Desktop', 'Opus-5.5-reel-naranja.mp4'), frameDir: T + '/frames', crf: 19, preset: 'medium', audio };
  fs.writeFileSync(T + '/job_opus.json', JSON.stringify(job, null, 2));
  console.log('escena lista. total:', total.toFixed(1), 's');
}
