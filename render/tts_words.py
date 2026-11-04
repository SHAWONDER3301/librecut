#!/usr/bin/env python
# Genera audio con edge-tts y guarda los tiempos POR PALABRA (para subtítulos karaoke).
# Uso: python tts_words.py "<texto>" <voz> <rate> <salida.mp3> <salida.words.json>
import asyncio, edge_tts, sys, json

text, voice, rate, out_mp3, out_json = sys.argv[1:6]

async def main():
    words = []
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary='WordBoundary')
    with open(out_mp3, 'wb') as f:
        async for c in comm.stream():
            if c['type'] == 'audio':
                f.write(c['data'])
            elif c['type'] == 'WordBoundary':
                # offset/duration vienen en unidades de 100 ns -> segundos
                words.append({'t': round(c['offset'] / 1e7, 3),
                              'd': round(c['duration'] / 1e7, 3),
                              'w': c['text']})
    with open(out_json, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False)
    print(f"OK {out_mp3} ({len(words)} palabras)")

asyncio.run(main())
