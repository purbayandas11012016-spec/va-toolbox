// decode.worker.js — mp4box demux + WebCodecs VideoDecoder, fully off the UI thread.
import MP4BoxNS from 'mp4box'
import { MSG } from '../lib/presets.js'

const MP4Box = MP4BoxNS?.createFile ? MP4BoxNS : MP4BoxNS?.default
const DataStream = MP4Box.DataStream

let demux = null
let info = null
let samples = { video: [], audio: [] }
let port = null

// ---- flow control: decode waits for the GPU stage to ACK each frame -------
let credits = 8
const waiters = []
const takeCredit = () => (credits > 0 ? (credits--, Promise.resolve()) : new Promise((r) => waiters.push(r)))

function attachChannel(p) {
  port = p
  port.onmessage = (e) => {
    if (e.data?.type === MSG.ACK) {
      const next = waiters.shift()
      if (next) next()
      else credits++
    }
  }
}

// AVC/HEVC need their in-band config box (avcC/hvcC). VP9/AV1 are self-describing and must NOT get one.
function codecDescription(trak) {
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC
    if (box) {
      const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN)
      box.write(ds)
      return new Uint8Array(ds.buffer, 8) // strip the 8-byte box header
    }
  }
  return undefined
}

// mp4box dispatches samples synchronously as we append, so a single full append is enough.
function parse(buffer) {
  demux = MP4Box.createFile()
  samples = { video: [], audio: [] }
  let ready = null
  demux.onError = (e) => {
    throw new Error(`Demux failed: ${e}`)
  }
  demux.onReady = (i) => {
    if (!i.videoTracks?.length) return
    ready = i
    demux.setExtractionOptions(i.videoTracks[0].id, 'video', { nbSamples: Infinity })
    if (i.audioTracks?.[0]) demux.setExtractionOptions(i.audioTracks[0].id, 'audio', { nbSamples: Infinity })
    demux.onSamples = (id, user, batch) => {
      const list = samples[user]
      for (const s of batch) list.push({ sync: s.is_sync, cts: s.cts, dur: s.duration, ts: s.timescale, data: s.data })
    }
    demux.start()
  }
  buffer.fileStart = 0
  demux.appendBuffer(buffer)
  demux.flush()
  if (!ready) throw new Error('No decodable video track found. Use an MP4/MOV file.')
  info = ready
  return ready
}

const emitProgress = (done, total) => self.postMessage({ type: MSG.DECODE_PROGRESS, done, total })

async function runDecode() {
  const v = info.videoTracks[0]
  const trak = demux.getTrackById(v.id)
  const description = codecDescription(trak)

  const base = { codec: v.codec, codedWidth: v.video.width, codedHeight: v.video.height, optimizeForLatency: true }
  if (description) base.description = description
  const support = await VideoDecoder.isConfigSupported(base)
  if (!support.supported) throw new Error(`Codec not supported by this browser: ${v.codec}`)

  const total = samples.video.length
  let decoded = 0
  let fatal = null

  const decoder = new VideoDecoder({
    output: (frame) => {
      decoded++
      port.postMessage({ type: MSG.FRAME, frame, index: decoded, timestamp: frame.timestamp }, [frame])
      if (decoded % 12 === 0 || decoded === total) emitProgress(decoded, total)
    },
    error: (e) => {
      fatal = e
    },
  })
  decoder.configure(support.config)

  for (let i = 0; i < total; i++) {
    if (fatal) throw fatal
    await takeCredit()
    while (decoder.decodeQueueSize > 24) await new Promise((r) => setTimeout(r, 1))
    const s = samples.video[i]
    decoder.decode(
      new EncodedVideoChunk({
        type: s.sync ? 'key' : 'delta',
        timestamp: Math.round((s.cts * 1e6) / s.ts),
        duration: Math.round((s.dur * 1e6) / s.ts),
        data: s.data,
      }),
    )
  }
  await decoder.flush()
  if (fatal) throw fatal
  decoder.close()

  emitProgress(total, total)
  port.postMessage({ type: MSG.EOS, frames: total })
  self.postMessage({ type: MSG.DECODE_DONE, frames: total })
}

self.onmessage = async (e) => {
  const msg = e.data
  try {
    if (msg.type === MSG.DECODE_INIT) return attachChannel(msg.port)

    if (msg.type === MSG.DECODE_PROBE) {
      const ready = parse(msg.buffer)
      const v = ready.videoTracks[0]
      const a = ready.audioTracks?.[0]
      const dur = ready.duration / ready.timescale
      const fps = v.video?.frame_rate || (v.nb_samples ? v.nb_samples / dur : 30)
      self.postMessage({
        type: MSG.DECODE_PROBE,
        probe: {
          container: msg.container,
          duration: dur,
          width: v.video.width,
          height: v.video.height,
          codec: v.codec,
          fps: Math.round((fps || 30) * 1000) / 1000,
          frameCount: v.nb_samples || samples.video.length,
          audio: a
            ? {
                codec: a.codec,
                sampleRate: a.audio?.sample_rate || 0,
                channels: a.audio?.channel_count || 0,
              }
            : null,
        },
      })
      return
    }

    if (msg.type === MSG.DECODE_START) return void (await runDecode())
  } catch (err) {
    self.postMessage({ type: MSG.DECODE_ERROR, error: err?.message || String(err) })
  }
}
