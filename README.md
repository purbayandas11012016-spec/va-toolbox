# VA Toolbox

**A fully local, browser-based video and audio processor.** Scale video from 144p up to 16K and convert audio bitrates/formats entirely on-device using WebCodecs, WebGPU, and ffmpeg.wasm. No backend, no uploads, no server round-trips.

---

## Features

- **Video scaling, 144p → 16K** — 11 built-in resolution presets (QVQA → 16K DCI) plus custom dimensions, with Fit / Fill / Stretch aspect handling.
- **Local audio conversion** — transcode to AAC, MP3, Opus, Vorbis, FLAC, or PCM/WAV with selectable bitrate, sample rate, and channel count.
- **Container muxing** — final output remuxed to MP4 / MKV / WebM / M4A / MP3 / OGG / FLAC / WAV via ffmpeg.wasm.
- **Zero-copy GPU pipeline** — decoded frames go straight into WebGPU with `importExternalTexture({ source })`; no raw pixel arrays touch JS memory.
- **Memory-safe by construction** — every `VideoFrame` is `close()`d and every intermediate GPU buffer is `destroy()`ed immediately after use, so 8K/16K runs don't crash the tab.
- **Fully off the main thread** — decoding, GPU scaling, encoding, and ffmpeg all run inside dedicated Web Workers.
- **Audio-only mode** — extract and re-encode just the audio track of any video.
- **Fully offline** — ffmpeg.wasm cores are self-hosted from the app's own `/public` directory; nothing is fetched from a CDN.

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 18 (function components), Inter, Phosphor Icons |
| Decode | WebCodecs `VideoDecoder` + mp4box.js (demux) |
| Scale / encode | WebGPU (WGSL) + WebCodecs `VideoEncoder` |
| Audio / mux | ffmpeg.wasm (`@ffmpeg/ffmpeg` 0.12) — single-thread and multi-thread cores |
| Container | mp4-muxer |
| Build | Vite 5 |

## Requirements

- A Chromium-based browser with **WebCodecs** *and* **WebGPU** — Chrome / Edge 113+ (WebGPU on Android needs Chrome 121+). Safari/Firefox are not supported.
- The page must be **cross-origin isolated** (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless`) so `SharedArrayBuffer` is available for the multithread ffmpeg core. Both the dev and preview servers set these headers automatically; a production host must set them too.

## Getting started

```bash
cd va-toolbox
npm install          # also copies the ffmpeg.wasm cores into public/ (postinstall)
npm run dev          # dev server with COOP/COEP headers
npm run build        # production bundle -> dist/
npm run preview      # serve dist/ with the same headers
```

## How it works

```
                 ┌───────────────┐   VideoFrame (transferable)   ┌───────────────┐
 file ─▶ decode.worker.js ─────────────── MessageChannel ───────▶ gpu.worker.js
        (mp4box demux +             ◀───────── ACK (backpressure)  (WebGPU scale +
         WebCodecs decode)                                       WebCodecs encode +
                                                                 mp4-muxer)
                                                                        │
                                                    H.264/VP9/AV1 MP4   │
                                                                        ▼
                              ┌───────────────┐   Transferable buffer ┌───────────────┐
                              │  mux.worker.js │◀────────────────────│   engine.js    │
                              │  (ffmpeg.wasm  │                    │ (main-thread   │
                              │   audio + mux) │────────────────────▶│  conductor)    │
                              └───────────────┘   final Blob/URL     └───────────────┘
```

1. **Probe / demux** — mp4box parses the container and hands encoded samples to the decode worker.
2. **Decode** — `VideoDecoder` emits `VideoFrame`s that are *transferred* (not copied) over a `MessageChannel`; credit/ACK flow control keeps the GPU stage exactly one frame behind.
3. **Scale + encode** — each frame is imported as an external texture, drawn through a WGSL pass to the target resolution, encoded, and muxed to MP4 in-memory. The source frame and uniform buffer are released immediately.
4. **Audio + mux** — ffmpeg.wasm transcodes the audio stream and combines it with the encoded video into the chosen container, then the finished buffer is transferred back to the UI.

## Project structure

```
va-toolbox/
├── index.html
├── vite.config.js          # COOP/COEP headers, worker bundling
├── scripts/
│   └── sync-ffmpeg-core.mjs   # copies ffmpeg cores into public/
└── src/
    ├── App.jsx             # layout + settings state
    ├── styles.css          # design system
    ├── components/         # SourcePanel, VideoPanel, AudioPanel, RunPanel, OutputPanel, ui, Toast
    ├── lib/
    │   ├── engine.js       # main-thread conductor (owns workers + frame channel)
    │   ├── presets.js      # resolutions, codecs, message protocol
    │   └── useProcessor.js # React hook around the engine
    └── workers/
        ├── decode.worker.js
        ├── gpu.worker.js
        └── mux.worker.js
```

## Notes & limitations

- Output is held **in memory** end-to-end, so very large files / long durations are bounded by available RAM (the UI warns above 3 GB).
- Video processing requires a WebGPU adapter; audio-only conversion works without one.
- All processing happens on the user's machine — the app makes no network requests for media.

## License

MIT
