// LibreCut · código original © 2026 $HAWONDER · github.com/SHAWONDER3301/librecut
// Biblioteca de diagramas animados para los reels explicativos de LibreCut.
//
// Cada diagrama es { design, min?, def, svg(p), anim }:
//  - design: duración (s) para la que se ajustó la animación. Si la escena dura
//    menos, la animación se acelera en proporción; si dura más, termina y se
//    queda viva (los bucles siguen). design 0 = se adapta a la duración real.
//  - min: duración mínima de animación para los adaptativos.
//  - def: datos por defecto (se mezclan con los "datos" de la escena del guion).
//  - svg(p): genera el SVG (viewBox 900x720) con los datos ya mezclados.
//  - anim: función (lt, dur, r, P) en texto que corre en la página. lt = tiempo
//    local de la escena, r = el contenedor del diagrama, P = los datos.
//
// Todo se dibuja con la paleta AZUL base; escena.mjs la recolorea entera.

export const BLUE = '#2f80ff', BLUE2 = '#5a9bff', CARD = '#0d1626', STROKE = 'rgba(120,160,255,.22)', GRAY = '#7d8aa5';
const MONO = `font-family="Consolas, 'Cascadia Mono', monospace"`;

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const glow = (id, dev = 8) => `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${dev}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const f1 = (n) => n.toFixed(1);
const arcPath = (cx, cy, R, a0, a1) => {
  const r0 = a0 * Math.PI / 180, r1 = a1 * Math.PI / 180;
  return `M${f1(cx + R * Math.cos(r0))} ${f1(cy + R * Math.sin(r0))} A${R} ${R} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${f1(cx + R * Math.cos(r1))} ${f1(cy + R * Math.sin(r1))}`;
};
const curve = (a, b) => `M${a[0]} ${a[1]} C ${(a[0] + b[0]) / 2} ${a[1]}, ${(a[0] + b[0]) / 2} ${b[1]}, ${b[0]} ${b[1]}`;
const chipW = (label) => Math.max(150, 70 + String(label).length * 14);
const chip = (cls, x, y, label, w = chipW(label)) =>
  `<g class="${cls}" data-x="${x}" data-y="${y}"><rect x="${x - w / 2}" y="${y - 26}" width="${w}" height="52" rx="26" fill="${CARD}" stroke="${BLUE}" stroke-width="2.5"/><circle cx="${x - w / 2 + 26}" cy="${y}" r="6" fill="${BLUE2}"/><text x="${x + 10}" y="${y + 8}" text-anchor="middle" fill="#eaf2ff" font-size="22" font-weight="800">${esc(label)}</text></g>`;
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map((s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')).join(''); };
const check = (cls, x, y, r = 15) => `<g class="${cls}"><circle cx="${x}" cy="${y}" r="${r}" fill="#28c840"/><path d="M${x - r * 0.47} ${y} L${x - r * 0.13} ${y + r * 0.4} L${x + r * 0.53} ${y - r * 0.47}" fill="none" stroke="#fff" stroke-width="${(r * 0.27).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

// Utilidades que usan las animaciones dentro de la página.
export const ANIM_HELPERS = `
const easeBack=x=>{x=clamp(x,0,1);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
function ell(cx,cy,rx,ry,deg,a){const r=deg*Math.PI/180,x=rx*Math.cos(a),y=ry*Math.sin(a);return [cx+x*Math.cos(r)-y*Math.sin(r), cy+x*Math.sin(r)+y*Math.cos(r)];}
function tf(r,sel,t){const e=r.querySelector(sel);if(e)e.setAttribute('transform',t);}
function sc(n,x,y,s){if(n)n.setAttribute('transform','translate('+x+' '+y+') scale('+s+') translate('+(-x)+' '+(-y)+')');}
function cxy(e,x,y){if(e){e.setAttribute('cx',x);e.setAttribute('cy',y);}}
function reveal(el,p){if(!el)return;const L=el.getTotalLength();el.setAttribute('stroke-dasharray',L);el.setAttribute('stroke-dashoffset',L*(1-clamp(p,0,1)));}
function fmt(n){return n>=1000?Math.floor(n/1000)+'.'+String(n%1000).padStart(3,'0'):String(n);}
function num(v,d){return Number(v).toLocaleString('es-ES',{minimumFractionDigits:d,maximumFractionDigits:d});}
`;

export const D = {};

// --- nucleo: núcleo HUD con anillos, partículas orbitando y 4 chips -------------
D.nucleo = {
  design: 5.35,
  def: { chips: ['Razona', 'Programa', 'Entiende', 'Actúa'] },
  svg: (p) => {
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
    const pos = [[150, 130], [750, 130], [150, 600], [750, 600]];
    const chips = p.chips.slice(0, 4).map((l, k) => [pos[k][0], pos[k][1], l]);
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
  },
  anim: `(lt,dur,r,P)=>{const In=easeOut(lt/0.6);
   r.querySelector('.hgrid').style.opacity=In;
   tf(r,'.hro','rotate('+(lt*10)+' 450 360)');tf(r,'.hrt','rotate('+(-lt*16)+' 450 360)');tf(r,'.hra','rotate('+(lt*38)+' 450 360)');
   ['.hro','.hrt','.hra','.horb'].forEach(s=>{r.querySelector(s).style.opacity=In;});
   sc(r.querySelector('.coreG'),450,360,easeBack(lt/0.7)*(1+0.04*Math.sin(lt*3)));
   const pr=r.querySelector('.pr'),rr=95+((lt*120)%200);pr.setAttribute('r',rr);pr.style.opacity=(1-(rr-95)/200)*0.7*In;
   const Q=[[250,100,25,1.5,0],[250,100,-25,-1.8,1.2],[175,175,0,2.4,2.5]];
   Q.forEach((q,i)=>{for(let j=0;j<5;j++){const p=ell(450,360,q[0],q[1],q[2],lt*q[3]+q[4]-j*0.09*Math.sign(q[3]));const e=r.querySelector('.p'+i+'_'+j);cxy(e,p[0],p[1]);if(e)e.style.opacity=In*(1-j*0.18);}});
   r.querySelectorAll('.chipl').forEach((l,k)=>{reveal(l,(lt-0.9-k*0.3)/0.4);});
   r.querySelectorAll('.chip').forEach((c,k)=>{const a=clamp((lt-1.0-k*0.3)/0.4,0,1);c.style.opacity=a;sc(c,+c.getAttribute('data-x'),+c.getAttribute('data-y'),0.6+0.4*easeBack(a));});}`
};

// --- arbol: árbol de decisión que explora, puntúa y elige una ruta ----------------
D.arbol = {
  design: 6.1,
  def: { columnas: ['PREGUNTA', 'EXPLORA', 'EVALÚA', 'RESPUESTA'], puntajes: ['41%', '58%', '63%', '96%', '37%', '52%'], elegido: 3 },
  svg: (p) => {
    const root = [110, 380], mids = [[360, 205], [360, 380], [360, 555]],
      leaves = [[610, 140], [610, 265], [610, 350], [610, 455], [610, 560], [610, 680]],
      concl = [820, 380], leafOf = [[0, 1], [2, 3], [4, 5]],
      chLeaf = Math.max(0, Math.min(5, p.elegido | 0)), chMid = Math.floor(chLeaf / 2), scores = p.puntajes;
    const dim = 'rgba(90,155,255,.3)';
    let edges = '';
    mids.forEach((m, i) => { const ch = i === chMid; edges += `<path class="edge" data-l="0" data-ch="${ch ? 1 : 0}" d="${curve(root, m)}" fill="none" stroke="${ch ? BLUE : dim}" stroke-width="${ch ? 5 : 3}" stroke-linecap="round"/>`; });
    mids.forEach((m, i) => leafOf[i].forEach((li) => { const ch = i === chMid && li === chLeaf; edges += `<path class="edge" data-l="1" data-ch="${ch ? 1 : 0}" d="${curve(m, leaves[li])}" fill="none" stroke="${ch ? BLUE : dim}" stroke-width="${ch ? 5 : 3}" stroke-linecap="round"/>`; }));
    leaves.forEach((l, li) => { const ch = li === chLeaf; edges += `<path class="edge" data-l="2" data-ch="${ch ? 1 : 0}" d="${curve(l, concl)}" fill="none" stroke="${ch ? '#eaf2ff' : 'rgba(90,155,255,.2)'}" stroke-width="${ch ? 4 : 2}" stroke-linecap="round"/>`; });
    const cm = mids[chMid], cl = leaves[chLeaf], s2 = curve(cm, cl), s3 = curve(cl, concl);
    const chpath = `<path class="chpath" d="${curve(root, cm)} ${s2.slice(s2.indexOf('C'))} ${s3.slice(s3.indexOf('C'))}" fill="none" stroke="none"/>`;
    const node = (x, y, l, i, ch, r0, core) => `<g class="nd" data-l="${l}" data-i="${i}" data-ch="${ch ? 1 : 0}"><circle cx="${x}" cy="${y}" r="${r0}" fill="${ch ? 'url(#r1core)' : CARD}" stroke="${ch ? '#eaf2ff' : BLUE}" stroke-width="3" ${ch ? 'filter="url(#r1f)"' : ''}/>${core ? `<circle cx="${x}" cy="${y}" r="${core}" fill="#fff"/>` : ''}</g>`;
    let nodes = node(root[0], root[1], 0, 0, true, 34, 11);
    mids.forEach((m, i) => { nodes += node(m[0], m[1], 1, i, i === chMid, 26, 0); });
    leaves.forEach((l, i) => { nodes += node(l[0], l[1], 2, i, i === chLeaf, 19, 0); });
    nodes += node(concl[0], concl[1], 3, 0, true, 32, 0);
    const sc = leaves.map((l, i) => `<text class="score" data-ch="${i === chLeaf ? 1 : 0}" x="${l[0]}" y="${l[1] - 30}" text-anchor="middle" fill="${i === chLeaf ? '#eaf2ff' : GRAY}" font-size="${i === chLeaf ? 22 : 18}" font-weight="800">${esc(scores[i] ?? '')}</text>`).join('');
    const heads = [110, 360, 610, 820].map((x, k) => `<text class="colh" x="${x}" y="52" text-anchor="middle" fill="${BLUE2}" font-size="18" font-weight="800" letter-spacing="2">${esc(p.columnas[k] ?? '')}</text>`).join('');
    return `<svg viewBox="0 0 900 720"><defs>${glow('r1f', 8)}
     <radialGradient id="r1core" cx="48%" cy="42%"><stop offset="0" stop-color="#eaf2ff"/><stop offset="60%" stop-color="${BLUE}"/><stop offset="100%" stop-color="#15305f"/></radialGradient></defs>
     ${heads}
     <g class="edges">${edges}</g>${chpath}
     <circle class="cburst" cx="${concl[0]}" cy="${concl[1]}" r="30" fill="none" stroke="#eaf2ff" stroke-width="3" opacity="0"/>
     <g class="nodes">${nodes}</g>${sc}
     <path class="ccheck" d="M806 381 L816 392 L836 369" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
     <circle class="ptr3" r="5" fill="#cfe0ff"/><circle class="ptr2" r="6.5" fill="#cfe0ff"/><circle class="ptr1" r="8" fill="#eaf2ff"/>
     <circle class="pulse" r="10" fill="#fff" filter="url(#r1f)"/></svg>`;
  },
  anim: `(lt,dur,r,P)=>{const dec=2.7,dimA=clamp((lt-dec)/0.4,0,1);
   r.querySelectorAll('.colh').forEach((h,k)=>{h.style.opacity=clamp((lt-0.1-k*0.45)/0.4,0,1);});
   r.querySelectorAll('.edge').forEach((e)=>{const lv=+e.getAttribute('data-l');const st=lv===0?0.25:(lv===1?0.8:1.35);reveal(e,(lt-st)/0.55);const ch=e.getAttribute('data-ch')==='1';e.style.opacity=ch?1:(1-0.7*dimA);if(ch&&lv<2)e.setAttribute('stroke-width',(5+2*dimA).toFixed(2));});
   r.querySelectorAll('.nd').forEach((n)=>{const lv=+n.getAttribute('data-l'),ix=+n.getAttribute('data-i');const a=clamp((lt-(0.1+lv*0.5+ix*0.07))/0.3,0,1);const c=n.querySelector('circle');sc(n,+c.getAttribute('cx'),+c.getAttribute('cy'),easeBack(a));const ch=n.getAttribute('data-ch')==='1';n.style.opacity=clamp(a*1.6,0,1)*(ch?1:(1-0.6*dimA));});
   r.querySelectorAll('.score').forEach((s,k)=>{const a=clamp((lt-1.25-k*0.07)/0.3,0,1);const ch=s.getAttribute('data-ch')==='1';s.style.opacity=a*(ch?1:(1-0.6*dimA));});
   const cp=r.querySelector('.chpath');if(cp){const L=cp.getTotalLength();const prog=lt<3.1?clamp((lt-1.9)/1.2,0,1):((lt-3.1)*0.45)%1;
     for(let j=0;j<4;j++){const e=r.querySelector(j===0?'.pulse':'.ptr'+j);if(!e)continue;const pt=cp.getPointAtLength(L*clamp(prog-j*0.025,0,1));cxy(e,pt.x,pt.y);e.style.opacity=(lt>1.9?1:0)*(1-j*0.22);}}
   reveal(r.querySelector('.ccheck'),(lt-3.1)/0.35);
   const cb=r.querySelector('.cburst'),b=clamp((lt-3.1)/0.6,0,1);cb.setAttribute('r',32+b*70);cb.style.opacity=(b>0&&b<1)?(1-b):0;}`
};

// --- codigo: editor que se escribe, falla, se corrige y pasa los tests -----------
D.codigo = {
  design: 6.6,
  def: { archivo: 'resumen.py', aviso: "SyntaxError: falta ')'", comando: 'python resumen.py', error: "SyntaxError: '(' was never closed", resultado: '9.0', ok: '✓ 12 tests passed' },
  svg: (p) => {
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
    const tipW = Math.max(188, 24 + String(p.aviso).length * 8.4);
    return `<svg viewBox="0 0 900 720"><defs>${glow('c2f', 6)}</defs>
   <g class="win">
     <rect x="110" y="70" width="680" height="490" rx="22" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
     <rect x="110" y="70" width="680" height="52" rx="22" fill="#132038"/><rect x="110" y="100" width="680" height="22" fill="#132038"/>
     <circle cx="146" cy="96" r="8" fill="#ff5f57"/><circle cx="174" cy="96" r="8" fill="#febc2e"/><circle cx="202" cy="96" r="8" fill="#28c840"/>
     <text x="450" y="103" text-anchor="middle" fill="${GRAY}" font-size="19" font-weight="700" ${MONO}>${esc(p.archivo)}</text>
     ${BL.map((y, i) => `<text x="150" y="${y}" text-anchor="middle" fill="#3a4a6a" font-size="22" ${MONO}>${i + 1}</text>`).join('')}
     <rect class="fixbg" x="${f1(X + 28 * CW - 2)}" y="248" width="18" height="32" rx="4" fill="#2ee88a" opacity="0"/>
     ${text}${covers}
     <path class="squig" d="${sq}" fill="none" stroke="#ff5f57" stroke-width="2.5" stroke-linejoin="round" opacity="0"/>
     <rect class="caret" x="${X}" y="146" width="3" height="28" fill="#eaf2ff"/>
     <g class="tip" opacity="0"><rect x="${f1(786 - tipW)}" y="228" width="${f1(tipW)}" height="34" rx="8" fill="#2a0f14" stroke="#ff5f57" stroke-width="1.5"/>
       <text x="${f1(798 - tipW)}" y="251" fill="#ffb3b0" font-size="15" font-weight="700">${esc(p.aviso)}</text></g>
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
  },
  anim: `(lt,dur,r,P)=>{const win=r.querySelector('.win');sc(win,450,315,0.92+0.08*easeOut(lt/0.4));win.style.opacity=easeOut(lt/0.3);
   const CW=14.29,X=185,LEN=[19,22,28,0,26],TS=[0.4,0.95,1.5,0,2.25],SP=0.025,BL=[168,220,272,324,376],fixT=3.8;
   let cx=X,cy=168;
   r.querySelectorAll('.cov').forEach((c,k)=>{const len=LEN[k];if(!len){c.setAttribute('width',0);return;}const typed=Math.floor(clamp((lt-TS[k])/(len*SP),0,1)*len);c.setAttribute('x',X+typed*CW);c.setAttribute('width',typed<len?(len-typed)*CW+12:0);if(lt>=TS[k]&&lt<TS[k]+len*SP+0.05){cx=X+typed*CW;cy=BL[k];}});
   if(lt>=TS[4]+26*SP){cx=lt>fixT?X+29*CW:X+26*CW;cy=lt>fixT?272:376;}
   const car=r.querySelector('.caret');car.setAttribute('x',cx);car.setAttribute('y',cy-22);car.style.opacity=(Math.floor(lt*2.5)%2)?0.15:1;
   const errOut=clamp((lt-fixT)/0.25,0,1);
   const sq=r.querySelector('.squig');reveal(sq,(lt-2.2)/0.35);sq.style.opacity=clamp((lt-2.2)/0.1,0,1)*(1-errOut);
   const tA=clamp((lt-2.4)/0.25,0,1),tip=r.querySelector('.tip');tip.style.opacity=tA*(1-errOut);tip.setAttribute('transform','translate(0 '+((1-tA)*8)+')');
   const fp=clamp((lt-fixT)/0.2,0,1);r.querySelector('.fixp').style.opacity=fp;r.querySelector('.fixbg').style.opacity=fp*(1-clamp((lt-fixT-0.3)/0.6,0,1))*0.7;
   const t0=r.querySelector('.t0'),t1=r.querySelector('.t1'),t2=r.querySelector('.t2'),cmd='$ '+P.comando;
   const typed=(s)=>cmd.slice(0,Math.floor(clamp((lt-s)/0.4,0,1)*cmd.length));
   if(lt<fixT){t0.textContent=typed(2.9);t1.textContent=lt>3.3?P.error:'';t1.setAttribute('fill','#ff6b6b');t2.textContent='';}
   else{t0.textContent=typed(fixT+0.15);t1.textContent=lt>fixT+0.6?P.resultado:'';t1.setAttribute('fill','#ffffff');t2.textContent=lt>fixT+0.85?P.ok:'';}
   const fixed=clamp((lt-(fixT+0.7))/0.5,0,1),bd=r.querySelector('.badge');
   bd.setAttribute('transform','translate(712 250) scale('+(0.6+0.4*easeBack(fixed))+')');bd.style.opacity=clamp(fixed*2.2,0,1);
   reveal(r.querySelector('.bring'),fixed/0.6);reveal(r.querySelector('.bchk'),(fixed-0.5)/0.4);
   const bp=r.querySelector('.bpulse'),pe=clamp((fixed-0.7)/0.3,0,1);bp.setAttribute('transform','scale('+(1+pe*0.9)+')');bp.style.opacity=(1-pe)*0.7;}`
};

// --- agente: un agente que usa 3 herramientas en secuencia (con vista previa) -----
D.agente = {
  design: 0, min: 4.5,
  def: {
    nombre: 'Agente', contador: 'TAREAS',
    tareas: [{ icono: '🌐', texto: 'Navega la web' }, { icono: '›_', texto: 'Ejecuta comandos' }, { icono: '🗎', texto: 'Edita archivos' }],
    url: 'docs.anthropic.com', comando: 'npm test', salida: '✓ 12 passed', salida2: 'listo en 1.2s', editado: 'EDITADO'
  },
  svg: (p) => {
    const Y0 = [86, 281, 476], T = p.tareas;
    const conns = Y0.map((y, i) => `<path class="conn" data-k="${i}" d="${curve([226, 380], [470, y + 75])}" fill="none" stroke="rgba(90,155,255,.45)" stroke-width="3" stroke-dasharray="8 10"/>`).join('');
    const head = (y, t) => `<rect class="chiprect" x="470" y="${y}" width="370" height="150" rx="18" fill="${CARD}" stroke="${BLUE}" stroke-width="2.5"/>
      <text x="500" y="${y + 39}" text-anchor="middle" font-size="24" fill="#fff">${esc(t.icono)}</text>
      <text x="522" y="${y + 38}" fill="#eaf2ff" font-size="23" font-weight="800">${esc(t.texto)}</text>
      <rect x="492" y="${y + 56}" width="326" height="80" rx="10" fill="#081020"/>
      ${check('chk', 812, y + 30)}`;
    const [y0, y1, y2] = Y0;
    const web = `<g class="tool" data-k="0">${head(y0, T[0])}
      <rect x="504" y="${y0 + 66}" width="302" height="24" rx="12" fill="#132038"/>
      <text class="wurl" x="522" y="${y0 + 83}" font-size="15" ${MONO} fill="#9fb3d9"></text>
      <rect class="wload" x="504" y="${y0 + 93}" width="0" height="3" fill="${BLUE}"/>
      ${[0, 1, 2].map((j) => `<rect class="wln" x="504" y="${y0 + 102 + j * 11}" width="0" height="6" rx="3" fill="rgba(255,255,255,.35)"/>`).join('')}</g>`;
    const shell = `<g class="tool" data-k="1">${head(y1, T[1])}
      <text class="scmd" x="506" y="${y1 + 84}" font-size="17" ${MONO} fill="#c8d3ea"></text>
      <text class="sout" x="506" y="${y1 + 108}" font-size="17" ${MONO} fill="#2ee88a" opacity="0">${esc(p.salida)}</text>
      <text class="sout2" x="506" y="${y1 + 128}" font-size="15" ${MONO} fill="#6f81a6" opacity="0">${esc(p.salida2)}</text></g>`;
    const files = `<g class="tool" data-k="2">${head(y2, T[2])}
      <rect class="fhl" x="500" y="${y2 + 96}" width="0" height="16" rx="4" fill="rgba(254,188,46,.35)"/>
      ${[250, 180, 220, 140].map((w, j) => `<rect x="506" y="${y2 + 68 + j * 16}" width="${w}" height="8" rx="4" fill="${j === 2 ? 'rgba(46,232,138,.55)' : 'rgba(255,255,255,.3)'}"/>`).join('')}
      <text class="ftag" x="790" y="${y2 + 110}" text-anchor="end" font-size="13" font-weight="800" fill="#2ee88a" opacity="0">${esc(p.editado)}</text></g>`;
    return `<svg viewBox="0 0 900 720"><defs>${glow('a3f', 7)}</defs>
     <text class="acount" x="470" y="56" fill="${BLUE2}" font-size="19" font-weight="800" letter-spacing="3">${esc(p.contador)} 0/3</text>
     <rect x="640" y="44" width="200" height="10" rx="5" fill="rgba(255,255,255,.1)"/>
     <rect class="abar" x="640" y="44" width="0" height="10" rx="5" fill="${BLUE}"/>
     ${conns}${web}${shell}${files}
     <circle class="aring" cx="160" cy="380" r="84" fill="none" stroke="${BLUE2}" stroke-width="3" stroke-dasharray="14 12"/>
     <g class="agent" filter="url(#a3f)"><circle cx="160" cy="380" r="62" fill="${BLUE}"/><circle cx="160" cy="380" r="62" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>
       <circle cx="143" cy="370" r="9" fill="#fff"/><circle cx="177" cy="370" r="9" fill="#fff"/><rect x="141" y="392" width="38" height="7" rx="3.5" fill="#fff"/></g>
     <text x="160" y="498" text-anchor="middle" fill="${BLUE2}" font-size="22" font-weight="800">${esc(p.nombre)}</text>
     <circle class="pk2" r="5" fill="#cfe0ff"/><circle class="pk1" r="7" fill="#eaf2ff"/><circle class="pkt" r="9" fill="#fff" filter="url(#a3f)"/></svg>`;
  },
  anim: `(lt,dur,r,P)=>{sc(r.querySelector('.agent'),160,380,easeBack(lt/0.5)*(1+0.04*Math.sin(lt*4)));
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
     if(i===0){const u=P.url;t.querySelector('.wurl').textContent=u.slice(0,Math.floor(clamp(p/0.5,0,1)*u.length));t.querySelector('.wload').setAttribute('width',302*clamp((p-0.3)/0.4,0,1));t.querySelectorAll('.wln').forEach((l,j)=>{l.setAttribute('width',[260,200,230][j]*easeOut((p-0.6-j*0.1)/0.3));});}
     if(i===1){const c='$ '+P.comando;t.querySelector('.scmd').textContent=c.slice(0,Math.floor(clamp(p/0.45,0,1)*c.length));t.querySelector('.sout').style.opacity=clamp((p-0.6)/0.15,0,1);t.querySelector('.sout2').style.opacity=clamp((p-0.8)/0.15,0,1);}
     if(i===2){const hl=t.querySelector('.fhl');hl.setAttribute('width',236*easeOut(p/0.6));hl.style.opacity=1-clamp((p-0.8)/0.2,0,1)*0.6;t.querySelector('.ftag').style.opacity=clamp((p-0.75)/0.2,0,1);}});
   r.querySelector('.acount').textContent=P.contador+' '+done+'/3';r.querySelector('.abar').setAttribute('width',200*done/3);
   const conn=r.querySelectorAll('.conn')[k];if(conn){const L=conn.getTotalLength();
     for(let j=0;j<3;j++){const ss=clamp(sp-j*0.03,0,1);const pr=ss<0.4?ss/0.4:(ss<0.6?1:1-(ss-0.6)/0.4);const pt=conn.getPointAtLength(L*clamp(pr,0,1));const e=r.querySelector(j===0?'.pkt':'.pk'+j);cxy(e,pt.x,pt.y);e.style.opacity=(busy?1:0)*(1-j*0.3);}}}`
};

// --- entradas: 3 entradas (texto/imagen/voz) -> red neuronal -> resultado -------
D.entradas = {
  design: 4.3,
  def: { etiquetas: ['TEXTO', 'IMAGEN', 'VOZ'], titulo: 'Comprensión', filas: ['Texto', 'Imagen', 'Voz'], boton: 'Respuesta lista' },
  svg: (p) => {
    const C = [470, 360];
    const N = [[-60, -40], [-20, -70], [35, -55], [70, -10], [50, 45], [5, 70], [-45, 55], [-75, 10], [-10, -5], [25, 20]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [8, 0], [8, 2], [8, 9], [9, 4], [9, 3], [8, 6], [1, 8], [9, 5]];
    const flowsTo = [[230, 170], [230, 345], [230, 525]];
    const flows = flowsTo.map((q) => `<path class="flow" d="${curve(q, [372, 360])}" fill="none" stroke="rgba(90,155,255,.45)" stroke-width="3" stroke-dasharray="4 10"/>`).join('');
    const fps = flowsTo.map((q, f) => [0, 1, 2].map((j) => `<circle class="fp" data-f="${f}" data-j="${j}" r="5" fill="#eaf2ff"/>`).join('')).join('');
    const L = p.etiquetas.map(esc), btnW = Math.max(180, 40 + String(p.boton).length * 9.5);
    return `<svg viewBox="0 0 900 720"><defs>${glow('m4f', 9)}<clipPath id="m4clip"><rect x="58" y="318" width="154" height="66" rx="8"/></clipPath></defs>
     ${flows}${fps}
     <g class="in" data-k="0"><rect x="40" y="120" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="142" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">${L[0]}</text>
       <text x="60" y="166" fill="${BLUE2}" font-size="24" font-weight="800">Aa</text>
       <rect x="60" y="178" width="150" height="8" rx="4" fill="#fff"/><rect x="60" y="193" width="120" height="8" rx="4" fill="rgba(255,255,255,.5)"/><rect x="60" y="207" width="90" height="8" rx="4" fill="rgba(255,255,255,.35)"/></g>
     <g class="in" data-k="1"><rect x="40" y="295" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="313" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">${L[1]}</text>
       <g clip-path="url(#m4clip)"><rect x="58" y="318" width="154" height="66" fill="#0a1526"/><circle cx="90" cy="338" r="10" fill="#febc2e"/>
         <path d="M58 384 L105 340 L140 370 L168 348 L212 384 Z" fill="${BLUE2}"/>
         <rect class="iscan" x="58" y="318" width="154" height="3" fill="#eaf2ff" opacity=".85"/></g></g>
     <g class="in" data-k="2"><rect x="40" y="475" width="190" height="100" rx="16" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
       <text x="220" y="493" text-anchor="end" fill="${GRAY}" font-size="13" font-weight="800" letter-spacing="2">${L[2]}</text>
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
       <text x="662" y="266" fill="#fff" font-size="23" font-weight="800">${esc(p.titulo)}</text>
       ${p.filas.slice(0, 3).map((t, k) => `<g class="orow"><circle cx="674" cy="${304 + k * 44}" r="12" fill="#28c840"/><path d="M668 ${304 + k * 44} L672 ${309 + k * 44} L680 ${298 + k * 44}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><text x="696" y="${311 + k * 44}" fill="#eaf2ff" font-size="20" font-weight="700">${esc(t)}</text></g>`).join('')}
       <g class="orow"><rect x="${f1(752 - btnW / 2)}" y="440" width="${f1(btnW)}" height="34" rx="17" fill="${BLUE}"/><text x="752" y="463" text-anchor="middle" fill="#fff" font-size="17" font-weight="800">${esc(p.boton)}</text></g></g></svg>`;
  },
  anim: `(lt,dur,r,P)=>{
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
   r.querySelectorAll('.op').forEach((p,j)=>{const L=of.getTotalLength();const ph=((lt*1.1)+j/2)%1;const pt=of.getPointAtLength(L*ph);cxy(p,pt.x,pt.y);p.style.opacity=oa*Math.sin(ph*Math.PI);});}`
};

// --- velocidad: el cursor activa un interruptor y se compara antes/después ------
D.velocidad = {
  design: 4.9,
  def: { titulo: 'Modo rápido', sub: 'Respuestas al instante', seccion: 'RESPUESTA', valor: 1240, metrica: 'tok/s', comparativa: 'COMPARATIVA', a: 'Normal', b: 'Rápido', ta: 14.9, tb: '0.3s ✓' },
  svg: (p) => `<svg viewBox="0 0 900 720"><defs>${glow('s5f', 7)}</defs>
   <g class="vcard">
     <rect x="150" y="120" width="600" height="490" rx="26" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
     <text x="190" y="190" fill="#fff" font-size="34" font-weight="800">${esc(p.titulo)}</text>
     <text x="190" y="220" fill="${GRAY}" font-size="18">${esc(p.sub)}</text>
     <rect class="track" x="596" y="166" width="114" height="54" rx="27" fill="#2a3550"/>
     <circle class="ripple" cx="653" cy="193" r="10" fill="none" stroke="${BLUE2}" stroke-width="3" opacity="0"/>
     <circle class="knob" cx="623" cy="193" r="23" fill="#8aa0c8"/>
     <text x="190" y="275" fill="${GRAY}" font-size="17" font-weight="800" letter-spacing="3">${esc(p.seccion)}</text>
     <text class="tps" x="600" y="275" text-anchor="end" fill="#2ee88a" font-size="18" font-weight="800" opacity="0">0</text>
     ${[0, 1, 2].map((i) => `<rect class="rln" x="190" y="${292 + i * 38}" width="0" height="24" rx="9" fill="${BLUE}"/>`).join('')}
     <rect class="shim" x="190" y="288" width="70" height="108" fill="#fff" opacity="0"/>
     <g class="bolt" filter="url(#s5f)" opacity="0"><path d="M680 270 L645 350 L680 350 L655 425 L732 330 L690 330 Z" fill="${BLUE}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>
     <g class="cmp">
       <text x="190" y="455" fill="${GRAY}" font-size="15" font-weight="800" letter-spacing="3">${esc(p.comparativa)}</text>
       <text x="190" y="494" fill="#9fb0d0" font-size="18" font-weight="700">${esc(p.a)}</text>
       <rect x="290" y="481" width="350" height="16" rx="8" fill="rgba(255,255,255,.08)"/>
       <rect class="cmpn" x="290" y="481" width="0" height="16" rx="8" fill="#5a6a88"/>
       <text class="cmpnt" x="652" y="494" fill="#9fb0d0" font-size="17" font-weight="700">0.0s…</text>
       <text x="190" y="540" fill="#fff" font-size="18" font-weight="800">${esc(p.b)}</text>
       <rect x="290" y="527" width="350" height="16" rx="8" fill="rgba(255,255,255,.08)"/>
       <rect class="cmpf" x="290" y="527" width="0" height="16" rx="8" fill="${BLUE}"/>
       <text class="cmpft" x="652" y="540" fill="#2ee88a" font-size="17" font-weight="800" opacity="0">${esc(p.tb)}</text></g>
   </g>
   <g class="cursor"><path d="M0 0 L0 32 L9 24 L15 36 L22 33 L14 21 L26 21 Z" fill="#fff" stroke="#0a1526" stroke-width="2"/></g></svg>`,
  anim: `(lt,dur,r,P)=>{const tF=1.0;r.querySelector('.vcard').style.opacity=easeOut(lt/0.3);
   const cur=r.querySelector('.cursor'),cp=easeOut(clamp(lt/tF,0,1));
   const cx=240+(640-240)*cp,cy=560-(560-202)*cp,click=(lt>tF-0.12&&lt<tF+0.1)?0.8:1;
   cur.setAttribute('transform','translate('+cx+' '+cy+') scale('+(1.5*click)+')');cur.style.opacity=lt<tF+0.7?1:clamp(1-(lt-tF-0.7)/0.3,0,1);
   const rp=r.querySelector('.ripple'),rb=clamp((lt-tF)/0.5,0,1);rp.setAttribute('r',10+rb*60);rp.style.opacity=(rb>0&&rb<1)?(1-rb)*0.8:0;
   const on=clamp((lt-tF)/0.22,0,1),knob=r.querySelector('.knob');knob.setAttribute('cx',623+60*on);knob.setAttribute('fill',on>0.5?'#fff':'#8aa0c8');
   r.querySelector('.track').setAttribute('fill',on>0.5?'${BLUE}':'#2a3550');
   const W=[400,330,370];r.querySelectorAll('.rln').forEach((ln,k)=>{ln.setAttribute('width',W[k]*easeOut(clamp((lt-(tF+0.25)-k*0.08)/0.2,0,1)));});
   const sv=clamp((lt-tF-0.6)/1.0,0,1),sh=r.querySelector('.shim');sh.setAttribute('x',190+sv*360);sh.style.opacity=(sv>0&&sv<1)?0.18:0;
   const tp=r.querySelector('.tps');tp.textContent=fmt(Math.round(P.valor*easeOut(clamp((lt-tF-0.2)/0.8,0,1))))+' '+P.metrica;tp.style.opacity=on;
   r.querySelector('.bolt').style.opacity=on*(0.55+0.45*Math.abs(Math.sin(lt*9)));
   r.querySelector('.cmp').style.opacity=clamp((lt-0.2)/0.4,0,1);
   const nP=clamp((lt-0.3)/(dur-0.6),0,1)*0.55;r.querySelector('.cmpn').setAttribute('width',350*nP);r.querySelector('.cmpnt').textContent=(nP*P.ta/0.55).toFixed(1)+'s…';
   const fP=clamp((lt-tF-0.2)/0.25,0,1);r.querySelector('.cmpf').setAttribute('width',350*easeOut(fP));r.querySelector('.cmpft').style.opacity=fP;}`
};

// --- construir: plano -> wireframe -> bloques isométricos que caen + 4 chips -----
D.construir = {
  design: 6.1,
  def: { chips: ['Apps', 'Webs', 'Juegos', 'Agentes'] },
  svg: (p, pal) => {
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
    const edge = 'stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-linejoin="round"';
    const wire = FIN.map(([x, y]) => { const f = faces(x, y); return ['top', 'left', 'right'].map((k) => `<polygon class="wf" points="${f[k]}" fill="none" stroke="rgba(130,180,255,.75)" stroke-width="1.6"/>`).join(''); }).join('');
    // Las caras laterales se sombrean a partir del color YA recoloreado (si no, quedarían azules).
    const blocks = FIN.map(([x, y], i) => { const f = faces(x, y); return `<g class="blk"><polygon points="${f.left}" fill="${shade(pal(cols[i]), 0.62)}" ${edge}/><polygon points="${f.right}" fill="${shade(pal(cols[i]), 0.42)}" ${edge}/><polygon points="${f.top}" fill="${cols[i]}" ${edge}/><polygon class="bsh" points="${f.top}" fill="#fff" opacity="0"/></g>`; }).join('');
    const pos = [[140, 200], [760, 200], [140, 600], [760, 600]];
    const chips = p.chips.slice(0, 4).map((l, k) => [pos[k][0], pos[k][1], l]);
    const cl = chips.map(([x, y]) => `<path class="bcl" d="M450 470 L${x} ${y}" stroke="rgba(90,155,255,.45)" stroke-width="2" fill="none"/>`).join('');
    return `<svg viewBox="0 0 900 720"><defs>${glow('b6f', 7)}</defs>
     <g class="bpgrid">${grid}</g>
     <g class="wire">${wire}</g>${cl}
     ${blocks}
     ${[0, 1, 2, 3, 4, 5, 6, 7].map(() => `<line class="ray" stroke="#eaf2ff" stroke-width="3" stroke-linecap="round" opacity="0"/>`).join('')}
     <g class="star" filter="url(#b6f)" opacity="0"><path d="M0 -42 L12 -13 L44 -13 L18 8 L28 40 L0 21 L-28 40 L-18 8 L-44 -13 L-12 -13 Z" fill="#fff" transform="translate(450 230)"/></g>
     ${chips.map(([x, y, l]) => chip('bchip', x, y, l)).join('')}</svg>`;
  },
  anim: `(lt,dur,r,P)=>{r.querySelector('.bpgrid').style.opacity=easeOut(lt/0.5);
   r.querySelectorAll('.wf').forEach((w,k)=>{reveal(w,(lt-0.3-k*0.03)/0.6);w.style.opacity=1-clamp((lt-2.6)/0.5,0,1)*0.8;});
   r.querySelectorAll('.blk').forEach((bl,k)=>{const a=clamp((lt-1.0-k*0.22)/0.5,0,1);bl.style.opacity=clamp(a*2,0,1);bl.setAttribute('transform','translate(0 '+((1-easeBack(a))*-260)+')');});
   r.querySelectorAll('.bsh').forEach((s,k)=>{const v=clamp(1-Math.abs(lt-(2.9+k*0.08))/0.18,0,1);s.style.opacity=v*0.55;});
   const st=clamp((lt-3.0)/0.45,0,1),star=r.querySelector('.star');sc(star,450,230,easeBack(st)*(1+0.08*Math.sin(lt*6)));star.style.opacity=st;
   r.querySelectorAll('.ray').forEach((ry,k)=>{const b=clamp((lt-3.05)/0.6,0,1),a=k*Math.PI/4,r1=50+b*40,r2=60+b*80;ry.setAttribute('x1',450+Math.cos(a)*r1);ry.setAttribute('y1',230+Math.sin(a)*r1);ry.setAttribute('x2',450+Math.cos(a)*r2);ry.setAttribute('y2',230+Math.sin(a)*r2);ry.style.opacity=(b>0&&b<1)?(1-b):0;});
   r.querySelectorAll('.bcl').forEach((l,k)=>{reveal(l,(lt-3.3-k*0.18)/0.35);});
   r.querySelectorAll('.bchip').forEach((c,k)=>{const a=clamp((lt-3.4-k*0.18)/0.35,0,1);c.style.opacity=a;sc(c,+c.getAttribute('data-x'),+c.getAttribute('data-y'),0.6+0.4*easeBack(a));});}`
};

// --- stat: cifra grande que cuenta dentro de un anillo de progreso --------------
D.stat = {
  design: 4.5,
  def: { valor: 97, max: 100, prefijo: '', sufijo: '%', decimales: 0, etiqueta: 'PRECISIÓN', detalle: '' },
  svg: (p) => {
    let ticks = '';
    for (let i = 0; i < 60; i++) {
      const a = i * 6 * Math.PI / 180, l = i % 5 === 0 ? 18 : 8;
      ticks += `<line x1="${f1(450 + Math.cos(a) * 250)}" y1="${f1(330 + Math.sin(a) * 250)}" x2="${f1(450 + Math.cos(a) * (250 + l))}" y2="${f1(330 + Math.sin(a) * (250 + l))}" stroke="rgba(140,180,255,${i % 5 === 0 ? '.55' : '.25'})" stroke-width="2"/>`;
    }
    return `<svg viewBox="0 0 900 720"><defs>${glow('st7', 9)}${glow('st7s', 4)}
      <radialGradient id="st7g"><stop offset="0" stop-color="${BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient></defs>
     <circle class="sglow" cx="450" cy="330" r="240" fill="url(#st7g)"/>
     <g class="sticks">${ticks}</g>
     <circle class="sdash" cx="450" cy="330" r="282" fill="none" stroke="${BLUE2}" stroke-width="2" stroke-dasharray="3 12" opacity=".5"/>
     <circle cx="450" cy="330" r="210" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="26"/>
     <circle class="sarc" cx="450" cy="330" r="210" fill="none" stroke="${BLUE}" stroke-width="26" stroke-linecap="round" transform="rotate(-90 450 330)" filter="url(#st7s)"/>
     <circle class="sdot" r="11" fill="#eaf2ff" filter="url(#st7)"/>
     <circle class="spulse" cx="450" cy="330" r="210" fill="none" stroke="#eaf2ff" stroke-width="3" opacity="0"/>
     <text class="snum" x="450" y="372" text-anchor="middle" fill="#fff" font-size="138" font-weight="900" letter-spacing="-3"></text>
     <text class="slab" x="450" y="430" text-anchor="middle" fill="${BLUE2}" font-size="26" font-weight="800" letter-spacing="5">${esc(p.etiqueta)}</text>
     ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(() => `<line class="sray" stroke="#eaf2ff" stroke-width="3" stroke-linecap="round" opacity="0"/>`).join('')}
     <text class="sdet" x="450" y="660" text-anchor="middle" fill="#c8d3ea" font-size="28" font-weight="700">${esc(p.detalle)}</text></svg>`;
  },
  anim: `(lt,dur,r,P)=>{const In=easeOut(lt/0.4),C=2*Math.PI*210;
   sc(r.querySelector('.sglow'),450,330,0.6+0.4*In+0.03*Math.sin(lt*3));r.querySelector('.sglow').style.opacity=In;
   tf(r,'.sticks','rotate('+(lt*8)+' 450 330)');r.querySelector('.sticks').style.opacity=In;
   tf(r,'.sdash','rotate('+(-lt*14)+' 450 330)');
   const g=easeOut(clamp((lt-0.3)/1.5,0,1)),frac=clamp(P.valor/(P.max||P.valor||1),0,1)*g;
   const arc=r.querySelector('.sarc');arc.setAttribute('stroke-dasharray',C);arc.setAttribute('stroke-dashoffset',C*(1-frac));arc.style.opacity=lt>0.3?1:0;
   const a=(-90+360*frac)*Math.PI/180;cxy(r.querySelector('.sdot'),450+210*Math.cos(a),330+210*Math.sin(a));r.querySelector('.sdot').style.opacity=lt>0.3?1:0;
   const n=r.querySelector('.snum');n.innerHTML=esc(P.prefijo)+num(P.valor*g,P.decimales)+'<tspan font-size="70" fill="${BLUE2}" dx="6">'+esc(P.sufijo)+'</tspan>';
   sc(n,450,330,0.7+0.3*easeBack(clamp(lt/0.5,0,1)));n.style.opacity=In;
   r.querySelector('.slab').style.opacity=clamp((lt-0.6)/0.4,0,1);
   const dA=clamp((lt-1.1)/0.4,0,1),det=r.querySelector('.sdet');det.style.opacity=dA;det.setAttribute('transform','translate(0 '+((1-easeOut(dA))*20)+')');
   const b=clamp((lt-1.85)/0.6,0,1),pu=r.querySelector('.spulse');pu.setAttribute('r',210+b*70);pu.style.opacity=(b>0&&b<1)?(1-b)*0.8:0;
   r.querySelectorAll('.sray').forEach((ry,k)=>{const an=k*Math.PI/6,r1=240+b*30,r2=255+b*70;ry.setAttribute('x1',450+Math.cos(an)*r1);ry.setAttribute('y1',330+Math.sin(an)*r1);ry.setAttribute('x2',450+Math.cos(an)*r2);ry.setAttribute('y2',330+Math.sin(an)*r2);ry.style.opacity=(b>0&&b<1)?(1-b):0;});}`
};

// --- lista: 2 a 5 puntos que entran uno a uno, se resaltan y se marcan ----------
D.lista = {
  design: 0, min: 4,
  def: { items: [{ icono: '1', texto: 'Primer punto' }, { icono: '2', texto: 'Segundo punto' }, { icono: '3', texto: 'Tercer punto' }] },
  svg: (p) => {
    const items = p.items.slice(0, 5), n = items.length;
    const H = n <= 3 ? 124 : n === 4 ? 106 : 90, G = n <= 3 ? 30 : 22, tot = n * H + (n - 1) * G, y0 = 360 - tot / 2;
    const cy = (i) => y0 + i * (H + G) + H / 2;
    const cards = items.map((it, i) => {
      const y = y0 + i * (H + G), c = cy(i), det = it.detalle ? 1 : 0;
      return `<g class="li" data-k="${i}">
        <rect x="150" y="${f1(y)}" width="680" height="${H}" rx="20" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>
        <rect class="lhl" x="150" y="${f1(y)}" width="680" height="${H}" rx="20" fill="rgba(47,128,255,.08)" stroke="${BLUE2}" stroke-width="3.5" opacity="0"/>
        <circle cx="218" cy="${f1(c)}" r="${Math.min(36, H / 2 - 14)}" fill="${BLUE}"/>
        <text x="218" y="${f1(c + 11)}" text-anchor="middle" fill="#fff" font-size="30" font-weight="800">${esc(it.icono ?? i + 1)}</text>
        <text x="276" y="${f1(c + (det ? -4 : 11))}" fill="#eaf2ff" font-size="${n <= 3 ? 32 : 28}" font-weight="800">${esc(it.texto)}</text>
        ${det ? `<text x="276" y="${f1(c + 28)}" fill="${GRAY}" font-size="21" font-weight="600">${esc(it.detalle)}</text>` : ''}
        ${check('lchk', 780, +f1(c), 19)}</g>`;
    }).join('');
    return `<svg viewBox="0 0 900 720"><defs>${glow('l8f', 6)}</defs>
     <line x1="90" y1="${f1(cy(0))}" x2="90" y2="${f1(cy(n - 1))}" stroke="rgba(255,255,255,.1)" stroke-width="4" stroke-linecap="round"/>
     <line class="lspine" x1="90" y1="${f1(cy(0))}" x2="90" y2="${f1(cy(0))}" stroke="${BLUE}" stroke-width="4" stroke-linecap="round" data-y0="${f1(cy(0))}" data-y1="${f1(cy(n - 1))}"/>
     ${items.map((_, i) => `<circle class="ldot" cx="90" cy="${f1(cy(i))}" r="10" fill="#2a3d66" stroke="${BLUE2}" stroke-width="3"/>`).join('')}
     <circle class="lpulse" cx="90" r="9" fill="#fff" filter="url(#l8f)"/>
     ${cards}</svg>`;
  },
  anim: `(lt,dur,r,P)=>{const cards=r.querySelectorAll('.li'),n=cards.length,sd=(dur-0.9)/n;
   cards.forEach((c,i)=>{const t0=0.3+i*sd,a=clamp((lt-t0)/0.35,0,1);c.style.opacity=a;c.setAttribute('transform','translate('+((1-easeOut(a))*70)+' 0)');
     const act=lt>=t0&&lt<t0+sd;c.querySelector('.lhl').style.opacity=act?Math.min(1,(lt-t0)/0.2):0;
     const ck=clamp((lt-(t0+sd*0.55))/0.25,0,1),chk=c.querySelector('.lchk'),cc=chk.querySelector('circle');sc(chk,+cc.getAttribute('cx'),+cc.getAttribute('cy'),easeBack(ck));chk.style.opacity=ck;});
   const sp=r.querySelector('.lspine'),y0=+sp.getAttribute('data-y0'),y1=+sp.getAttribute('data-y1');
   const pr=n>1?clamp((lt-0.3)/((n-1)*sd),0,1):1,y=y0+(y1-y0)*pr;sp.setAttribute('y2',y);
   const pl=r.querySelector('.lpulse');pl.setAttribute('cy',y);pl.style.opacity=lt>0.3?0.6+0.4*Math.abs(Math.sin(lt*5)):0;
   r.querySelectorAll('.ldot').forEach((d,i)=>{const on=lt>=0.3+i*sd;d.setAttribute('fill',on?'${BLUE}':'#2a3d66');d.setAttribute('r',on?12:10);});}`
};

// --- comparar: barras horizontales que crecen, con una destacada ---------------
D.comparar = {
  design: 4.5,
  def: { titulo: 'COMPARATIVA', unidad: '%', decimales: 0, max: 0, mejor: 'MEJOR',
    filas: [{ texto: 'Opción A', valor: 62 }, { texto: 'Opción B', valor: 71 }, { texto: 'Opción C', valor: 94, destacado: true }] },
  svg: (p) => {
    const rows = p.filas.slice(0, 5), n = rows.length;
    const max = p.max || (p.unidad === '%' ? 100 : Math.max(...rows.map((r) => +r.valor)) * 1.08);
    const RH = n <= 3 ? 150 : n === 4 ? 122 : 102, y0 = 390 - (n * RH) / 2 + 40;
    let grid = '';
    for (let k = 0; k <= 4; k++) {
      const x = 110 + 600 * k / 4;
      grid += `<line x1="${x}" y1="${f1(y0 - 50)}" x2="${x}" y2="${f1(y0 + n * RH - 40)}" stroke="rgba(255,255,255,${k ? '.06' : '.18'})" stroke-width="2"/>`;
    }
    const bars = rows.map((r, i) => {
      const y = y0 + i * RH, d = !!r.destacado, w = 600 * Math.min(1, (+r.valor) / max);
      return `<g class="crow" data-k="${i}">
        <text x="110" y="${f1(y - 16)}" fill="${d ? '#fff' : '#c8d3ea'}" font-size="${d ? 28 : 26}" font-weight="${d ? 800 : 700}">${esc(r.texto)}</text>
        ${d ? `<g class="cbest"><rect x="${f1(600)}" y="${f1(y - 44)}" width="110" height="34" rx="17" fill="${BLUE}"/><text x="655" y="${f1(y - 21)}" text-anchor="middle" fill="#fff" font-size="16" font-weight="800" letter-spacing="2">${esc(p.mejor)}</text></g>` : ''}
        <rect x="110" y="${f1(y)}" width="600" height="34" rx="17" fill="rgba(255,255,255,.06)"/>
        <rect class="cbar" data-w="${f1(w)}" x="110" y="${f1(y)}" width="0" height="34" rx="17" fill="${d ? BLUE : '#3a4a6a'}" ${d ? 'filter="url(#c9f)"' : ''}/>
        ${d ? `<rect class="cshine" x="110" y="${f1(y)}" width="60" height="34" rx="17" fill="#fff" opacity="0"/>` : ''}
        <text class="cval" data-v="${+r.valor}" x="730" y="${f1(y + 27)}" fill="${d ? '#fff' : '#9fb0d0'}" font-size="30" font-weight="800">0</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 900 720"><defs>${glow('c9f', 7)}</defs>
     <text class="ctit" x="110" y="${f1(y0 - 90)}" fill="${BLUE2}" font-size="20" font-weight="800" letter-spacing="4">${esc(p.titulo)}</text>
     ${grid}${bars}</svg>`;
  },
  anim: `(lt,dur,r,P)=>{r.querySelector('.ctit').style.opacity=easeOut(lt/0.4);
   const rows=r.querySelectorAll('.crow'),n=rows.length,end=0.35+(n-1)*0.22+1.0;
   rows.forEach((w,i)=>{const a=clamp((lt-0.15-i*0.22)/0.3,0,1);w.style.opacity=a;
     const g=easeOut(clamp((lt-0.35-i*0.22)/1.0,0,1)),bar=w.querySelector('.cbar');bar.setAttribute('width',(+bar.getAttribute('data-w'))*g);
     const v=w.querySelector('.cval');v.textContent=num((+v.getAttribute('data-v'))*g,P.decimales)+P.unidad;v.setAttribute('x',110+(+bar.getAttribute('data-w'))*g+20);
     const sh=w.querySelector('.cshine');if(sh){const s=clamp((lt-end)/0.7,0,1);sh.setAttribute('x',110+s*((+bar.getAttribute('data-w'))-60));sh.style.opacity=(s>0&&s<1)?0.35:0;}
     const be=w.querySelector('.cbest');if(be){const b=clamp((lt-end-0.1)/0.35,0,1),bb=be.querySelector('rect');sc(be,+bb.getAttribute('x')+55,+bb.getAttribute('y')+17,easeBack(b));be.style.opacity=b;}});}`
};

// --- pasos: línea de tiempo horizontal; un pulso recorre y activa cada paso -----
D.pasos = {
  design: 0, min: 4,
  def: { etiqueta: 'PASO', pasos: [{ icono: '💡', texto: 'Idea' }, { icono: '✏️', texto: 'Diseña' }, { icono: '⚙️', texto: 'Construye' }, { icono: '🚀', texto: 'Lanza' }] },
  svg: (p) => {
    const st = p.pasos.slice(0, 5), n = st.length, x0 = n <= 3 ? 170 : 110, x1 = 900 - x0, Y = 330;
    const X = (i) => (n === 1 ? 450 : x0 + (x1 - x0) * i / (n - 1));
    const nodes = st.map((s, i) => `<g class="pn" data-k="${i}" data-x="${f1(X(i))}">
        <text x="${f1(X(i))}" y="${Y - 90}" text-anchor="middle" fill="${GRAY}" font-size="17" font-weight="800" letter-spacing="3">${esc(p.etiqueta)} ${i + 1}</text>
        <circle class="pring" cx="${f1(X(i))}" cy="${Y}" r="62" fill="none" stroke="${BLUE2}" stroke-width="2" stroke-dasharray="4 8" opacity="0"/>
        <circle class="pc" cx="${f1(X(i))}" cy="${Y}" r="50" fill="${CARD}" stroke="${BLUE}" stroke-width="3"/>
        <text x="${f1(X(i))}" y="${Y + 14}" text-anchor="middle" font-size="40" fill="#fff">${esc(s.icono ?? i + 1)}</text>
        <text class="pt" x="${f1(X(i))}" y="${Y + 100}" text-anchor="middle" fill="#eaf2ff" font-size="${n >= 5 ? 22 : 27}" font-weight="800">${esc(s.texto)}</text>
        ${s.detalle ? `<text x="${f1(X(i))}" y="${Y + 132}" text-anchor="middle" fill="${GRAY}" font-size="19" font-weight="600">${esc(s.detalle)}</text>` : ''}</g>`).join('');
    return `<svg viewBox="0 0 900 720"><defs>${glow('p10f', 7)}</defs>
     <line x1="${x0}" y1="${Y}" x2="${x1}" y2="${Y}" stroke="rgba(255,255,255,.1)" stroke-width="6" stroke-linecap="round"/>
     <line class="pline" x1="${x0}" y1="${Y}" x2="${x0}" y2="${Y}" stroke="${BLUE}" stroke-width="6" stroke-linecap="round" data-x0="${x0}" data-x1="${x1}" filter="url(#p10f)"/>
     ${nodes}
     <circle class="ppulse" cy="${Y}" r="10" fill="#fff" filter="url(#p10f)"/></svg>`;
  },
  anim: `(lt,dur,r,P)=>{const nodes=r.querySelectorAll('.pn'),n=nodes.length,ln=r.querySelector('.pline'),x0=+ln.getAttribute('data-x0'),x1=+ln.getAttribute('data-x1');
   const T0=0.6,span=Math.max(0.8,dur-1.4),pr=n>1?clamp((lt-T0)/span,0,1):1,x=x0+(x1-x0)*pr;
   ln.setAttribute('x2',x);const pp=r.querySelector('.ppulse');pp.setAttribute('cx',x);pp.style.opacity=(lt>T0&&pr<1)?1:0;
   nodes.forEach((nd,i)=>{const a=clamp((lt-0.1-i*0.1)/0.35,0,1),nx=+nd.getAttribute('data-x');
     const tR=n>1?T0+span*(nx-x0)/(x1-x0):T0,reached=lt>=tR;
     nd.style.opacity=a*(reached?1:0.45);
     const c=nd.querySelector('.pc');c.setAttribute('fill',reached?'${BLUE}':'${CARD}');
     sc(c,nx,330,0.85+0.15*easeBack(clamp((lt-tR)/0.35,0,1)));
     const ring=nd.querySelector('.pring');ring.style.opacity=reached?0.8:0;ring.setAttribute('transform','rotate('+(lt*50)+' '+nx+' 330)');});}`
};

// --- imagen: una foto/captura en marco con zoom lento, escaneo y pie ------------
D.imagen = {
  design: 0, min: 3,
  def: { archivo: '', pie: '' },
  svg: (p) => {
    const href = p.archivo ? 'file:///' + String(p.archivo).replace(/\\/g, '/').replace(/^\/+/, '') : '';
    return `<svg viewBox="0 0 900 720"><defs>${glow('i11f', 8)}<clipPath id="i11c"><rect x="90" y="80" width="720" height="500" rx="24"/></clipPath></defs>
     <rect class="iframe" x="80" y="70" width="740" height="520" rx="30" fill="${CARD}" stroke="${BLUE}" stroke-width="3" filter="url(#i11f)"/>
     <g clip-path="url(#i11c)"><rect x="90" y="80" width="720" height="500" fill="#0a1526"/>
       ${href ? `<image class="img" href="${esc(href)}" x="90" y="80" width="720" height="500" preserveAspectRatio="xMidYMid slice"/>` : ''}
       <rect class="iscan2" x="90" y="80" width="720" height="4" fill="#eaf2ff" opacity=".0"/></g>
     ${[[80, 70, 1, 1], [820, 70, -1, 1], [80, 590, 1, -1], [820, 590, -1, -1]].map(([x, y, sx, sy]) => `<path class="icor" d="M${x} ${y + sy * 50} L${x} ${y} L${x + sx * 50} ${y}" fill="none" stroke="#eaf2ff" stroke-width="5" stroke-linecap="round"/>`).join('')}
     ${p.pie ? `<g class="ipie"><rect x="${f1(450 - (40 + String(p.pie).length * 13) / 2)}" y="620" width="${f1(40 + String(p.pie).length * 13)}" height="54" rx="27" fill="${BLUE}"/><text x="450" y="656" text-anchor="middle" fill="#fff" font-size="26" font-weight="800">${esc(p.pie)}</text></g>` : ''}</svg>`;
  },
  anim: `(lt,dur,r,P)=>{const a=easeOut(lt/0.5),fr=r.querySelector('.iframe');sc(fr,450,330,0.94+0.06*a);fr.style.opacity=a;
   const im=r.querySelector('.img');if(im){sc(im,450,330,(1.04+0.08*clamp(lt/dur,0,1))*(0.94+0.06*a));im.style.opacity=a;}
   const s=clamp((lt-0.2)/0.9,0,1),sn=r.querySelector('.iscan2');sn.setAttribute('y',80+s*496);sn.style.opacity=(s>0&&s<1)?0.8:0;
   r.querySelectorAll('.icor').forEach((c,k)=>{reveal(c,(lt-0.3-k*0.08)/0.35);});
   const pi=r.querySelector('.ipie');if(pi){const b=clamp((lt-0.8)/0.4,0,1);pi.style.opacity=b;pi.setAttribute('transform','translate(0 '+((1-easeOut(b))*24)+')');}}`
};

export const TIPOS = Object.keys(D);
