// Monta la escena HTML del reel (estilo CotiPro): marca arriba-izquierda,
// etiqueta + titular con palabra resaltada, diagrama animado, subtítulos karaoke
// palabra a palabra y barra de progreso. Expone window.seek(t) para htmlrender.
import { D, ANIM_HELPERS, esc } from './diagramas.mjs';

// --- Paletas ----------------------------------------------------------------------
// Los diagramas se dibujan en azul; aquí se recolorea TODO el HTML. "naranja" usa
// un mapa ajustado a mano; el resto gira el tono de los colores azulados.
// El verde de éxito, el rojo de error y la sintaxis del código no se tocan.
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
export const PALETAS = { azul: null, naranja: 22, rojo: 2, verde: 150, morado: 268, rosa: 330, cian: 188, dorado: 42 };
const KEEP = new Set(['#61afef']); // azul de la sintaxis del editor de código

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
// Gira el tono de un color solo si es azulado (195°–245°).
function rot(r, g, b, tono) {
  const [h, s, l] = rgb2hsl(r, g, b);
  if (h < 195 || h > 245 || s < 0.12) return null;
  return hsl2rgb(tono + (h - 217), s, l);
}

export function recolorer(paleta) {
  const tono = typeof paleta === 'number' ? paleta : PALETAS[paleta ?? 'azul'];
  if (tono == null) return (s) => s;
  const hex = (h) => '#' + h.map((v) => v.toString(16).padStart(2, '0')).join('');
  return (str) => {
    let s = str;
    if (paleta === 'naranja') s = WARM.reduce((acc, [a, b]) => acc.split(a).join(b), s);
    s = s.replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => {
      if (KEEP.has(m.toLowerCase())) return m;
      const n = parseInt(h, 16), o = rot((n >> 16) & 255, (n >> 8) & 255, n & 255, tono);
      return o ? hex(o) : m;
    });
    return s.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),/g, (m, r, g, b) => {
      const o = rot(+r, +g, +b, tono);
      return o ? `rgba(${o[0]},${o[1]},${o[2]},` : m;
    });
  };
}

// "Claude *Opus 5.5*" -> "Claude <b>Opus 5.5</b>" (también acepta <b> directo)
const titular = (t) => esc(t).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/&lt;(\/?)b&gt;/g, '<$1b>');

// beats: [{ etiqueta, titulo, diagrama, datos, start, dur, caps:[{t,w}] }]
export function construirEscena(guion, beats, total) {
  const vertical = guion.formato === 'vertical';
  const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
  const pal = recolorer(guion.paleta);
  const marca = guion.marca;
  const rejilla = guion.fondo === 'rejilla';       // suelo de cuadrícula en perspectiva (synthwave)
  const titCond = guion.titularEstilo === 'condensado'; // titular condensado en cursiva y MAYÚSCULAS

  // Fondo de rejilla en perspectiva. Se dibuja en azul base para que la paleta lo recoloree.
  const gridSvg = () => {
    const hy = Math.round(H * 0.56), vx = W / 2, n = 16, m = 14;
    let v = '', h = '', sq = '';
    for (let i = 0; i <= n; i++) { const xb = Math.round(-W / 2 + 2 * W * i / n);
      v += `<line x1="${vx}" y1="${hy}" x2="${xb}" y2="${H}" stroke="rgba(90,155,255,0.3)" stroke-width="2"/>`; }
    for (let k = 1; k <= m; k++) { const t = Math.pow(k / m, 2.3), y = (hy + (H - hy) * t).toFixed(1);
      h += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(90,155,255,${(0.1 + 0.32 * t).toFixed(2)})" stroke-width="2"/>`; }
    const sx = Math.round(W / 22), sy = Math.round(H / 14);
    for (let x = 0; x <= W; x += sx) sq += `<line x1="${x}" y1="0" x2="${x}" y2="${hy}" stroke="rgba(90,155,255,0.06)" stroke-width="1"/>`;
    for (let y = 0; y <= hy; y += sy) sq += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(90,155,255,0.06)" stroke-width="1"/>`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="position:absolute;inset:0">
      <defs><radialGradient id="rg" cx="50%" cy="56%" r="62%"><stop offset="0" stop-color="#2f80ff" stop-opacity="0.22"/><stop offset="1" stop-color="#2f80ff" stop-opacity="0"/></radialGradient></defs>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#rg)"/>
      <g>${sq}</g><g>${h}${v}</g>
      <rect x="0" y="${hy - 2}" width="${W}" height="3" fill="rgba(140,180,255,0.5)"/></svg>`;
  };

  const used = [...new Set(beats.map((b) => b.diagrama))];
  for (const t of used) if (!D[t]) throw new Error(`diagrama desconocido: "${t}". Disponibles: ${Object.keys(D).join(', ')}`);

  const page = beats.map((b) => {
    const d = D[b.diagrama];
    return { start: b.start, dur: b.dur, eyebrow: b.etiqueta || '', head: titular(b.titulo || ''),
      tipo: b.diagrama, design: d.design, min: d.min || 0, P: b.P, caps: b.caps };
  });
  const svgs = beats.map((b, i) => `<div class="diagram" data-i="${i}">${D[b.diagrama].svg(b.P, pal)}</div>`).join('');
  const anims = used.map((t) => `${JSON.stringify(t)}:${D[t].anim}`).join(',\n');

  const layout = vertical ? `
#brand{top:80px;left:70px}
#wrap{flex-direction:column;align-items:stretch;justify-content:flex-start;padding:250px 50px 440px}
#left{width:100%;padding:0 20px}
#head{font-size:86px}
#right{flex:1;margin-top:20px}
#art,.diagram svg{width:980px;height:784px}
#caps{bottom:330px;left:60px;right:60px;font-size:52px;line-height:1.5}` : `
#brand{top:60px;left:110px}
#wrap{align-items:center;padding:0 110px}
#left{width:44%}
#head{font-size:92px}
#right{flex:1}
#art,.diagram svg{width:820px;height:660px}
#caps{bottom:120px;left:0;right:0;font-size:44px}`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf8"><style>
*{margin:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#05070d;font-family:'Segoe UI',system-ui,sans-serif}
#bg{position:absolute;inset:0;background:radial-gradient(${vertical ? '1100px 900px at 50% 108%' : '1200px 700px at 60% 118%'}, rgba(47,128,255,.22), transparent 60%);}
#brand{position:absolute;display:flex;align-items:center;gap:16px;z-index:3}
#brand .sq{width:46px;height:46px;border-radius:12px;background:#2f80ff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:26px}
#brand .t{color:#eaf0ff;font-weight:800;font-size:28px}
#wrap{position:absolute;inset:0;display:flex}
#eyebrow{display:flex;align-items:center;gap:14px;color:#5a9bff;font-weight:800;font-size:26px;letter-spacing:8px;margin-bottom:26px}
#eyebrow .dot{width:12px;height:12px;border-radius:50%;background:#2f80ff}
#head{color:#fff;font-weight:800;line-height:1.04;letter-spacing:-1px}
#head b{color:#2f80ff}
#right{display:flex;justify-content:center;align-items:center}
#art{position:relative}
.diagram{position:absolute;inset:0;opacity:0}.diagram svg{display:block;font-family:'Segoe UI',system-ui,sans-serif}
#caps{position:absolute;text-align:center;font-weight:800;z-index:3}
.cap{display:inline-block;margin:0 5px;color:#aeb9d4;padding:3px 6px}
.cap.act{background:#2f80ff;color:#fff;border-radius:14px;padding:3px 18px}
#bar{position:absolute;left:0;bottom:0;height:10px;width:100%;background:rgba(255,255,255,.07)}
#barfill{height:100%;width:0;background:#2f80ff}
#grid{position:absolute;inset:0;z-index:0}
${titCond ? "#head{font-family:'Arial Narrow','Segoe UI Semibold',system-ui,sans-serif;font-stretch:condensed;font-style:italic;text-transform:uppercase;font-weight:900;letter-spacing:-1px}#head b{font-style:italic}#eyebrow{font-style:italic}" : ''}
${layout}
</style></head><body>
<div id="bg"></div>${rejilla ? `<div id="grid">${gridSvg()}</div>` : ''}
${marca ? `<div id="brand">${marca.letra ? `<div class="sq">${esc(marca.letra)}</div>` : ''}<div class="t">${esc(marca.texto || '')}</div></div>` : ''}
<div id="wrap">
  <div id="left"><div id="eyebrow"><span class="dot"></span><span id="ebtext"></span></div><div id="head"></div></div>
  <div id="right"><div id="art">${svgs}</div></div>
</div>
<div id="caps"></div>
<div id="bar"><div id="barfill"></div></div>
<script>
const BEATS=${JSON.stringify(page)};const TOTAL=${total};
const ebt=document.getElementById('ebtext'),head=document.getElementById('head'),left=document.getElementById('left'),
 capsEl=document.getElementById('caps'),elBar=document.getElementById('barfill'),diags=[...document.querySelectorAll('.diagram')];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),easeOut=x=>1-Math.pow(1-clamp(x,0,1),3);
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
${ANIM_HELPERS}
const DIAGRAMS={${anims}};
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
  // Si la escena es más corta que la animación diseñada, se acelera en proporción.
  const dd=Math.max(b.design||0,b.min||0,b.dur),k=dd/b.dur;
  try{DIAGRAMS[b.tipo](lt*k,dd,diags[idx],b.P);}catch(e){window.__err=String(e&&e.stack||e);}
  renderCaps(idx,t);capsEl.style.opacity=beatA;
};
window.seek(0);
</script></body></html>`;

  return { html: pal(html), width: W, height: H };
}
