// mux.worker.js — ffmpeg.wasm audio transcode + final container mux, isolated from the UI thread.
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL, fetchFile } from '@ffmpeg/util'
import classWorkerURL from '@ffmpeg/ffmpeg/worker?worker&url'
import { MSG } from '../lib/presets.js'

// Cores are self-hosted from /public — no CDN, no network, no backend.
const BASE = import.meta.env.BASE_URL || '/'
const CORES = {
  st: `${BASE}ffmpeg`,
  mt: `${BASE}ffmpeg-mt`,
}

let ffmpeg = null
let loadPromise = null

async function boot(threaded) {
  const ff = new FFmpeg()
  ff.on('log', ({ message }) => {
    if (/error|invalid|failed/i.test(message)) self.postMessage({ type: MSG.MUX_PROGRESS, log: message })
  })
  ff.on('progress', ({ progress }) => {
    self.postMessage({ type: MSG.MUX_PROGRESS, progress: Math.max(0, Math.min(1, progress)) })
  })

  const base = threaded ? CORES.mt : CORES.st
  const opts = {
    classWorkerURL,
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  }
  if (threaded) opts.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript')
  await ff.load(opts)
  ff.threaded = threaded
  return ff
}

// Multithread needs SharedArrayBuffer (cross-origin isolation); fall back to single-thread if it cannot boot.
async function loadFFmpeg() {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const canThread = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated
    if (canThread) {
      try {
        return await boot(true)
      } catch (e) {
        self.postMessage({ type: MSG.MUX_PROGRESS, log: `MT core unavailable (${e?.message}); using single-thread core` })
      }
    }
    return boot(false)
  })()
  return loadPromise
}

const extOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : 'mp4')

const mp4Flags = (container) => (container === 'mp4' ? ['-movflags', '+faststart'] : [])

function audioArgs(audio) {
  const args = ['-c:a', audio.codec]
  if (!audio.lossless) args.push('-b:a', `${audio.bitrate}k`)
  if (audio.sampleRate) args.push('-ar', String(audio.sampleRate))
  if (audio.channels) args.push('-ac', String(audio.channels))
  return args
}

async function run(job) {
  ffmpeg = await loadFFmpeg()
  const { input, videoBuffer, container, name, audio, mode } = job
  const inName = `src.${extOf(name)}`
  const outName = mode === 'audio' ? `out.${audio.ext}` : `out.${container}`

  await ffmpeg.writeFile(inName, await fetchFile(input))

  let args
  if (mode === 'audio') {
    args = ['-i', inName, '-vn', ...audioArgs(audio), '-y', outName]
  } else if (!audio) {
    await ffmpeg.writeFile('v.mp4', new Uint8Array(videoBuffer))
    args = ['-i', 'v.mp4', '-c', 'copy', ...mp4Flags(container), '-y', outName]
  } else {
    await ffmpeg.writeFile('v.mp4', new Uint8Array(videoBuffer))
    // MP4 cannot carry PCM; fall back to AAC for that container.
    const acodec = container === 'mp4' && audio.codec === 'pcm_s16le' ? 'aac' : audio.codec
    args = [
      '-i', 'v.mp4',
      '-i', inName,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      ...audioArgs({ ...audio, codec: acodec }),
      '-shortest',
      ...mp4Flags(container),
      '-y', outName,
    ]
  }

  await ffmpeg.exec(args)
  const data = await ffmpeg.readFile(outName)
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)

  await ffmpeg.deleteFile(inName).catch(() => {})
  await ffmpeg.deleteFile('v.mp4').catch(() => {})
  await ffmpeg.deleteFile(outName).catch(() => {})

  self.postMessage({ type: MSG.MUX_DONE, buffer, name: outName, mime: mimeFor(outName) }, [buffer])
}

const mimeFor = (n) => {
  const e = extOf(n)
  return { mp4: 'video/mp4', mkv: 'video/x-matroska', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav' }[e] || 'application/octet-stream'
}

self.onmessage = async (e) => {
  const msg = e.data
  try {
    if (msg.type === MSG.MUX_INIT) {
      const ff = await loadFFmpeg()
      self.postMessage({ type: MSG.MUX_INIT, ok: true, threaded: !!ff.threaded })
      return
    }
    if (msg.type === MSG.MUX_START) return void (await run(msg))
  } catch (err) {
    self.postMessage({ type: MSG.MUX_ERROR, error: err?.message || String(err) })
  }
}
