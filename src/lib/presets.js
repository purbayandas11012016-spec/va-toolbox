// Shared worker <-> main message protocol. Keep keys short: these cross postMessage boundaries.

export const MSG = {
  // decode.worker
  DECODE_INIT: 'dec-init',
  DECODE_PROBE: 'dec-probe',
  DECODE_START: 'dec-start',
  DECODE_DONE: 'dec-done',
  DECODE_ERROR: 'dec-error',
  DECODE_PROGRESS: 'dec-progress',
  // gpu.worker
  GPU_INIT: 'gpu-init',
  GPU_START: 'gpu-start',
  GPU_DONE: 'gpu-done',
  GPU_ERROR: 'gpu-error',
  GPU_PROGRESS: 'gpu-progress',
  GPU_CAPS: 'gpu-caps',
  // mux.worker (ffmpeg.wasm)
  MUX_INIT: 'mux-init',
  MUX_START: 'mux-start',
  MUX_DONE: 'mux-done',
  MUX_ERROR: 'mux-error',
  MUX_PROGRESS: 'mux-progress',
  // frame channel (decode -> gpu)
  FRAME: 'frame',
  EOS: 'eos',
  ACK: 'ack',
  FLUSH: 'flush',
}

export const RESOLUTIONS = [
  { id: '144p', label: '144p', height: 144, note: 'QVGA' },
  { id: '240p', label: '240p', height: 240, note: 'SD low' },
  { id: '360p', label: '360p', height: 360, note: 'SD' },
  { id: '480p', label: '480p', height: 480, note: 'SD+' },
  { id: '540p', label: '540p', height: 540, note: 'qHD' },
  { id: '720p', label: '720p', height: 720, note: 'HD' },
  { id: '1080p', label: '1080p', height: 1080, note: 'Full HD' },
  { id: '1440p', label: '1440p', height: 1440, note: '2K' },
  { id: '2160p', label: '2160p', height: 2160, note: '4K UHD' },
  { id: '4320p', label: '4320p', height: 4320, note: '8K UHD' },
  { id: '8640p', label: '16K', height: 8640, note: '16K DCI' },
]

export const VIDEO_CODECS = [
  { id: 'avc1.640034', label: 'H.264 High', short: 'H.264', family: 'avc', container: 'mp4' },
  { id: 'avc1.4d0032', label: 'H.264 Main', short: 'H.264', family: 'avc', container: 'mp4' },
  { id: 'vp09.00.10.08', label: 'VP9', short: 'VP9', family: 'vp9', container: 'webm' },
  { id: 'av01.0.08M.08', label: 'AV1', short: 'AV1', family: 'av1', container: 'mp4' },
]

export const AUDIO_FORMATS = [
  { id: 'aac', label: 'AAC', ext: 'm4a', codec: 'aac', lossless: false },
  { id: 'mp3', label: 'MP3', ext: 'mp3', codec: 'libmp3lame', lossless: false },
  { id: 'opus', label: 'Opus', ext: 'ogg', codec: 'libopus', lossless: false },
  { id: 'vorbis', label: 'Vorbis', ext: 'ogg', codec: 'libvorbis', lossless: false },
  { id: 'flac', label: 'FLAC', ext: 'flac', codec: 'flac', lossless: true },
  { id: 'pcm', label: 'WAV / PCM', ext: 'wav', codec: 'pcm_s16le', lossless: true },
]

export const AUDIO_BITRATES = [64, 96, 128, 160, 192, 256, 320]
export const SAMPLE_RATES = [8000, 16000, 22050, 32000, 44100, 48000, 96000]
export const CHANNELS = [
  { id: 1, label: 'Mono' },
  { id: 2, label: 'Stereo' },
  { id: 6, label: '5.1' },
]

export const SCALE_MODES = [
  { id: 'contain', label: 'Fit' },
  { id: 'cover', label: 'Fill' },
  { id: 'stretch', label: 'Stretch' },
]

// Even dimensions keep 4:2:0 chroma encoders happy.
export const even = (n) => Math.max(2, Math.round(n / 2) * 2)

export function targetSize(srcW, srcH, res, custom) {
  if (res === 'source') return { width: even(srcW), height: even(srcH) }
  if (res === 'custom') return { width: even(custom.width || srcW), height: even(custom.height || srcH) }
  const preset = RESOLUTIONS.find((r) => r.id === res) || RESOLUTIONS[5]
  const height = even(preset.height)
  const aspect = srcW && srcH ? srcW / srcH : 16 / 9
  return { width: even(height * aspect), height }
}

export const bytes = (n) => {
  if (!n && n !== 0) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

export const duration = (s) => {
  if (!s || !isFinite(s)) return '—'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return [h, m, sec].filter((v, i) => i || v).map((v) => String(v).padStart(2, '0')).join(':')
}
