// engine.js — main-thread conductor. Owns worker lifetimes and wires the frame channel.
import { MSG, targetSize } from './presets.js'

// Vite statically analyses these literals to emit dedicated worker bundles.
const spawnWorkers = () => ({
  decode: new Worker(new URL('../workers/decode.worker.js', import.meta.url), { type: 'module' }),
  gpu: new Worker(new URL('../workers/gpu.worker.js', import.meta.url), { type: 'module' }),
  mux: new Worker(new URL('../workers/mux.worker.js', import.meta.url), { type: 'module' }),
})

export class VAEngine {
  constructor(emit) {
    this.emit = emit
    this.initPromise = null
    this.probeInfo = null
    this.file = null
    this.pending = {}
    this.caps = null
    this.threaded = false
  }

  init() {
    if (this.initPromise) return this.initPromise
    this.initPromise = new Promise((resolve, reject) => {
      let decode
      let gpu
      let mux
      try {
        ;({ decode, gpu, mux } = spawnWorkers())
      } catch (e) {
        return reject(e)
      }
      this.decode = decode
      this.gpu = gpu
      this.mux = mux

      decode.onmessage = (e) => this.route(e.data)
      gpu.onmessage = (e) => this.route(e.data)
      mux.onmessage = (e) => this.route(e.data)

      // Register both readiness promises before any await, so no message can slip past.
      // GPU failure must not brick the engine: audio jobs never touch the GPU, so capture caps-or-error instead of rejecting.
      const gpuReady = this.once(MSG.GPU_CAPS)
        .then((g) => {
          this.caps = g.caps
        })
        .catch((e) => {
          this.gpuError = e.message
        })
      const muxReady = this.once(MSG.MUX_INIT)

      // Direct decode -> gpu frame channel. VideoFrames move as transferables; ACKs ride back the same port.
      const { port1, port2 } = new MessageChannel()
      decode.postMessage({ type: MSG.DECODE_INIT, port: port1 }, [port1])
      gpu.postMessage({ type: MSG.GPU_INIT, port: port2 }, [port2])
      mux.postMessage({ type: MSG.MUX_INIT })

      Promise.all([gpuReady, muxReady])
        .then(([, m]) => {
          this.threaded = !!m.threaded
          resolve()
        })
        .catch(reject)
    })
    return this.initPromise
  }

  once(type) {
    return new Promise((resolve, reject) => {
      this.pending[type] = { resolve, reject }
    })
  }

  settle(type, data) {
    const p = this.pending[type]
    if (!p) return false
    delete this.pending[type]
    if (data.error) p.reject(new Error(data.error))
    else p.resolve(data)
    return true
  }

  route(data) {
    const t = data?.type
    if (t === MSG.DECODE_PROGRESS) return this.emit('decode-progress', data)
    if (t === MSG.GPU_PROGRESS) return this.emit('gpu-progress', data)
    if (t === MSG.MUX_PROGRESS) return this.emit('mux-progress', data)
    if (t === MSG.DECODE_ERROR || t === MSG.GPU_ERROR || t === MSG.MUX_ERROR) {
      // Fail whichever request is in flight so callers never hang.
      const settled = [
        MSG.DECODE_PROBE,
        MSG.GPU_START,
        MSG.GPU_CAPS,
        MSG.MUX_INIT,
        MSG.DECODE_DONE,
        MSG.GPU_DONE,
        MSG.MUX_DONE,
      ].some((k) => this.settle(k, data))
      this.emit('error', { error: data.error })
      return settled
    }
    this.settle(t, data)
  }

  async probe(file) {
    await this.init()
    this.file = file
    const buffer = await file.arrayBuffer()
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
    const p = this.once(MSG.DECODE_PROBE)
    this.decode.postMessage({ type: MSG.DECODE_PROBE, buffer, container: ext }, [buffer])
    const res = await p
    this.probeInfo = res.probe
    return res.probe
  }

  async run(settings) {
    await this.init()
    const probe = this.probeInfo
    if (!probe) throw new Error('No source loaded')
    const { width, height } = targetSize(probe.width, probe.height, settings.resolution, settings.custom)
    const fps = Math.min(120, Math.max(1, Math.round(probe.fps || 30)))
    const hasAudio = !!(probe.audio && settings.audioEnabled)

    if (settings.mode === 'audio') {
      this.emit('stage', { stage: MSG.MUX_START })
      return this.muxOut({ mode: 'audio', audio: settings.audio, videoBuffer: null })
    }

    const bitrate = settings.quality === 'auto' ? autoBitrate(width, height, fps) : settings.quality * 1000
    if (!this.caps) throw new Error(this.gpuError || 'WebGPU is unavailable — video scaling needs a WebGPU-capable browser.')
    if (Math.max(width, height) > this.caps.maxTexture) {
      throw new Error(`Target ${width}x${height} exceeds GPU limit ${this.caps.maxTexture}px. Pick a lower resolution.`)
    }

    const gpuStarted = this.once(MSG.GPU_START)
    this.emit('stage', { stage: 'pipeline' })
    this.gpu.postMessage({
      type: MSG.GPU_START,
      config: { width, height, fps, bitrate, codec: settings.videoCodec, mode: settings.scaleMode },
    })
    await gpuStarted

    const gpuDone = this.once(MSG.GPU_DONE)
    this.decode.postMessage({ type: MSG.DECODE_START })

    const { buffer: videoBuffer } = await gpuDone
    this.emit('stage', { stage: MSG.MUX_START })
    return this.muxOut({
      mode: 'video',
      audio: hasAudio ? settings.audio : null,
      videoBuffer,
      container: settings.container,
    })
  }

  async muxOut(job) {
    const p = this.once(MSG.MUX_DONE)
    this.mux.postMessage({
      type: MSG.MUX_START,
      input: this.file,
      name: this.file.name,
      videoBuffer: job.videoBuffer,
      container: job.container,
      audio: job.audio,
      mode: job.mode,
    }, job.videoBuffer ? [job.videoBuffer] : [])
    const { buffer, name, mime } = await p
    return { blob: new Blob([buffer], { type: mime }), name, stats: { audioOnly: job.mode === 'audio' } }
  }

  terminate() {
    this.decode?.terminate()
    this.gpu?.terminate()
    this.mux?.terminate()
    this.initPromise = null
  }
}

function autoBitrate(w, h, fps) {
  const bpp = 0.09
  const raw = w * h * fps * bpp
  return Math.round(Math.min(400_000_000, Math.max(500_000, raw)))
}

export { autoBitrate }
