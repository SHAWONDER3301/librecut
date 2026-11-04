# LibreCut

Editor de vídeo de escritorio, **de código abierto (MIT)**, que corre **100 % en local**:
sin cuenta, sin inicio de sesión, **sin telemetría** y sin ninguna llamada de red.
El motor de vídeo es **FFmpeg nativo**, con export a **1080p hasta 120 FPS**.

> Proyecto original. No contiene ni deriva de código de ningún producto comercial;
> está inspirado únicamente en *qué hace* un editor de vídeo corriente.

## Qué hace (MVP)

- Importar vídeo, audio e imágenes (se sondean con ffprobe: duración, resolución, fps, audio).
- Bin de medios con miniaturas.
- Timeline multipista (2 de vídeo + 1 de audio) con:
  - arrastrar desde el bin a la timeline,
  - mover clips, recortar por los bordes (trim),
  - dividir en el cursor (botón o tecla **S**),
  - eliminar (**Supr**),
  - zoom y regla de tiempo.
- Previsualización con reproducción (barra espaciadora), cursor y scrub.
- Inspector de clip (volumen por clip).
- Guardar / abrir proyecto (`.lcut`, JSON).
- **Exportar** a MP4 (H.264 + AAC) componiendo toda la timeline con FFmpeg:
  escalado con pillarbox a la resolución elegida, superposición por pistas,
  huecos en negro y mezcla de audio por clip.

## Privacidad

- No se abre ningún socket de red. La `Content-Security-Policy` del renderer
  sólo permite `self`, `data:`, `blob:` y el esquema interno `media:`.
- El único proceso externo que se lanza es FFmpeg, con argumentos construidos
  por la app (ver `electron/exporter.js`).
- Los ficheros locales se sirven al reproductor por un protocolo interno
  (`media://`) con soporte de *range* para hacer seek, sin exponer `file://`.

## Requisitos

- Node.js ≥ 22.23 (probado con 24.22.1).
- La instalación descarga los binarios de FFmpeg/FFprobe (`ffmpeg-static`,
  `ffprobe-static`) y Electron. Tras instalar, funciona sin red.

## Uso

```bash
npm install
npm start
```

Modo desarrollo con DevTools:

```bash
npm run dev
```

## Uso headless / por un agente (CLI)

LibreCut se puede operar **sin GUI** desde la terminal con `cli/librecut.js`, que
usa el mismo motor que la app. Ideal para automatización o para que un agente
(como Claude) monte y renderice vídeos solo.

```bash
node cli/librecut.js probe video.mp4            # metadatos (JSON)
node cli/librecut.js silence voz.mp3            # tramos de silencio (JSON)
node cli/librecut.js make guion.json -o reel.mp4   # compila un spec y renderiza
node cli/librecut.js make guion.json --dry-run  # ver el proyecto sin renderizar
node cli/librecut.js render proyecto.lcut       # renderiza un proyecto .lcut
node cli/librecut.js schema                     # esquema del spec de make
```

El **spec** de `make` es un JSON sencillo (pistas: `V1`/`V2` vídeo, `Txt` texto,
`A1` audio). Si omites `start`, el clip va tras el último de su pista; si omites
`duration`, se usa la del medio:

```json
{
  "output": "reel.mp4",
  "resolution": "1080x1920",
  "fps": 60,
  "quality": "alta",
  "clips": [
    { "file": "intro.mp4", "track": "V1", "in": 0, "duration": 5, "fadeIn": 0.5 },
    { "file": "parte2.mp4", "track": "V1", "in": 2, "duration": 4, "xfadeIn": 1, "removeSilence": true },
    { "text": "Mi título", "track": "Txt", "start": 1, "duration": 3, "pos": "bottom", "fontSize": 72, "color": "yellow" },
    { "file": "musica.mp3", "track": "A1", "start": 0, "duration": 9, "volume": 0.6, "fadeOut": 1 }
  ]
}
```

Soporta todo lo que hace la GUI: trim (`in`/`duration`), `speed`, `fadeIn`/`fadeOut`,
`xfadeIn` (crossfade), `volume`, texto, `removeSilence` y resoluciones 16:9 / 9:16 / 1:1.
Las rutas pueden ser absolutas, relativas o estilo Git Bash (`/c/Users/...`).

### Animación (motion por código, vía FFmpeg)

- **Texto animado** `animIn`: `fade`, `up`, `down`, `left`, `right` (entrada con
  fundido + deslizamiento).
- **Transiciones** entre clips (con `xfadeIn`): `transition` = `fade` (crossfade),
  `slideleft`, `slideright`, `slideup`, `slidedown`.
- **Ken Burns / zoom** en imágenes y vídeo: `kenburns` = `in`, `out`, `left`, `right`
  (también convierte una imagen fija en un fondo en movimiento).
- **Barra de progreso** global: `progressBar: true` + color `accent`.

No es un motor de motion-graphics completo (para eso está HyperFrames), pero da
vida real a los vídeos sin salir de FFmpeg.

### Motor HTML → vídeo (motion-graphics por código)

Para animaciones ricas de verdad (tipografía cinética, fondos con glow, etc.),
LibreCut puede **renderizar una escena HTML/CSS/JS animada a MP4**. La escena
expone `window.seek(t)` y el motor la mueve fotograma a fotograma de forma
determinista (captura con Electron, codifica con FFmpeg). Nada de reloj real:
toda la animación se calcula desde `t`, así que el render es reproducible.

```bash
node cli/librecut.js renderhtml escena.html -o reel.mp4 \
     --duration 43 --w 1080 --h 1920 --fps 30 \
     --audio voz1.wav@0,voz2.wav@6,musica.mp3@0
```

La escena mínima:

```html
<div id="t"></div>
<script>
  window.seek = function (t) {            // t en segundos
    document.getElementById('t').style.opacity = Math.min(1, t / 0.5);
  };
  window.seek(0);
</script>
```

Editar el vídeo = editar CSS/JS. Es la forma más fácil de conseguir movimiento
rico. Ejemplo completo (reel animado de 7 escenas): `render/scenes/opus55.html`
generado por `render/buildhtml.mjs`.

### Reels explicativos desde un guion JSON

`render/reel/` genera reels completos sin escribir HTML. El guion trae una
escena por idea con el texto narrado, el titular y el tipo de diagrama.

Por cada escena genera:
- la voz neural, con los tiempos de cada palabra;
- el titular con la palabra resaltada;
- el diagrama animado;
- los subtítulos karaoke y la barra de progreso.

Funciona en horizontal o vertical y con varias paletas de color.

```bash
node render/reel/reel.mjs render/reel/ejemplos/opus55.json --snap   # capturas + hoja.png para revisar
node render/reel/reel.mjs render/reel/ejemplos/opus55.json          # render completo
node render/reel/reel.mjs --tipos                                   # diagramas y sus datos
```

Hay 12 diagramas:
- `nucleo`, `arbol`, `codigo`, `agente`, `entradas`, `velocidad` y `construir`;
- `stat`, `lista`, `comparar`, `pasos` e `imagen`.

Las paletas son `azul`, `naranja`, `rojo`, `verde`, `morado`, `rosa`, `cian` y
`dorado`, o cualquier tono como número.

## Arquitectura

```
cli/
  librecut.js   CLI headless (probe, silence, render, make, schema)
electron/
  main.js       Proceso principal, ventana, IPC, protocolo media://
  preload.js    Puente seguro (contextBridge) -> window.api
  media.js      Sondeo (ffprobe), miniaturas, ondas y silencios (ffmpeg)
  exporter.js   Construye y ejecuta el filter_complex de FFmpeg
renderer/
  index.html    Estructura de la UI
  styles.css    Estilos
  store.js      Estado + operaciones de edición
  timeline.js   Render e interacción de la timeline
  preview.js    Motor de previsualización
  app.js        Cableado de toolbar, bin, inspector, export
```

El proyecto es un JSON: `media` (ficheros) + `tracks` con `clips`
(`start`, `inPoint`, `duration`, `volume`). El exportador coloca cada clip en
una base negra con `overlay ... enable='between(t,ini,fin)'` y retarda el audio
con `adelay`, mezclando con `amix`.

## Limitaciones conocidas del MVP

- La previsualización muestra la pista de vídeo **más alta activa** (vídeo + su
  audio); la mezcla multipista completa se ve sólo al exportar.
- Sin transiciones, textos ni velocidad variable todavía (ver hoja de ruta).
- Clips de la misma pista no se solapan (se empujan automáticamente).

## Extras (fase "lo máximo posible") — ya incluidos

- [x] **Títulos / texto** con `drawtext` (pista de texto, tamaño, color, posición).
- [x] **Fundidos** de entrada/salida por clip (vídeo `fade` + audio `afade`).
- [x] **Velocidad por clip** (`setpts` / `atempo`, 0.25×–4×).
- [x] **Quitar silencios** del clip seleccionado (`silencedetect` + ripple).

- [x] **Crossfade** de entrada por clip (mezcla con alfa sobre lo anterior).
- [x] **Formas de onda reales** en los clips con audio (`showwavespic`).
- [x] **Exportar 9:16 / 1:1** y presets de calidad (Alta/Media/Rápida).
- [x] **Deshacer / rehacer** (Ctrl+Z / Ctrl+Shift+Z o Ctrl+Y).

### Pendiente

- [ ] Transiciones por tipo (wipe, slide) además del crossfade.
- [ ] Pistas ilimitadas y reordenar pistas.
- [ ] Autoguardado del proyecto.

## Licencia

MIT (código de LibreCut). FFmpeg se distribuye bajo sus propias licencias
LGPL/GPL. Ver `LICENSE`.
