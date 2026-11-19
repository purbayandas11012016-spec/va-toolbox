// gpu.worker.js — WebGPU scaling (zero-copy external texture) + WebCodecs encode + MP4 mux.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { MSG } from '../lib/presets.js'

const SHADER = /* wgsl */ `
struct Params { k: vec4f };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_external;
@group(0) @binding(2) var<uniform> params: Params;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f,3>(vec2f(-1.,-1.), vec2f(3.,-1.), vec2f(-1.,3.));
  var o: VSOut;
  o.pos = vec4f(p[i], 0., 1.);
  o.uv = vec2f((p[i].x + 1.) * 0.5, 1. - (p[i].y + 1.) * 0.5);
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let uv = in.uv * params.k.xy + params.k.zw;
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) { return vec4f(0., 0., 0., 1.); }
  return textureSampleBaseClampToEdge(tex, samp, uv);
}
`

let device = null
let pipeline = null
let sampler = null
let format = 'bgra8unorm'
let canvas = null
let ctx = null
let port = null
let encoder = null
let muxer = null
let cfg = null
let eos = false
let encoded = 0

// One ACK per frame keeps the decode stage exactly one frame ahead of the GPU stage.
const ack = () => port?.postMessage({ type: MSG.ACK })

function scaleParams(srcW, srcH, dstW, dstH, mode) {
  const r = (srcW / srcH) / (dstW / dstH)
  let kx = 1
  let ky = 1
  if (mode === 'contain') {
    kx = 1 / Math.min(1, r)
    ky = Math.max(1, r)
  } else if (mode === 'cover') {
    kx = Math.min(1, r)
    ky = 1 / Math.max(1, r)
  }
  return new Float32Array([kx, ky, 0.5 * (1 - kx), 0.5 * (1 - ky)])
}

async function initGPU() {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('WebGPU adapter unavailable')
  device = await adapter.requestDevice()
  format = navigator.gpu.getPreferredCanvasFormat()
  device.lost.then((i) => self.postMessage({ type: MSG.GPU_ERROR, error: `GPU device lost: ${i.reason}` }))

  const module = device.createShaderModule({ code: SHADER })
  pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

  self.postMessage({ type: MSG.GPU_CAPS, caps: { maxTexture: device.limits.maxTextureDimension2D, format } })
}

function setupEncoder() {
  const { width, height, fps, codec, bitrate, keyInterval } = cfg
  canvas = new OffscreenCanvas(width, height)
  ctx = canvas.getContext('webgpu')
  ctx.configure({ device, format, alphaMode: 'opaque' })

  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec.family === 'vp9' ? 'vp9' : codec.family === 'av1' ? 'av1' : 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
  })

  encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => self.postMessage({ type: MSG.GPU_ERROR, error: e?.message || String(e) }),
  })
}

async function configureEncoder() {
  const { width, height, fps, bitrate } = cfg
  const config = {
    codec: cfg.codec.id,
    width,
    height,
    bitrate,
    framerate: fps,
    latencyMode: 'quality',
  }
  if (cfg.codec.family === 'avc') config.avc = { format: 'avc' }
  const support = await VideoEncoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`Encoder rejected ${cfg.codec.id} at ${width}x${height}`)
  encoder.configure(config)
}

function renderAndEncode(frame) {
  const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(uniform, 0, scaleParams(frame.displayWidth, frame.displayHeight, cfg.width, cfg.height, cfg.mode))

  const external = device.importExternalTexture({ source: frame }) // zero-copy: no pixel readback into JS
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: external },
      { binding: 2, resource: { buffer: uniform } },
    ],
  })

  const enc = device.createCommandEncoder()
  const pass = enc.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.draw(3)
  pass.end()
  device.queue.submit([enc.finish()])

  const stamp = Math.round(frame.timestamp)
  const out = new VideoFrame(canvas, { timestamp: stamp, duration: Math.round(1e6 / cfg.fps) })
  encoder.encode(out, { keyFrame: encoded % cfg.keyInterval === 0 })
  out.close()

  uniform.destroy() // free the intermediate uniform buffer immediately
  frame.close() // release the decoded source frame
  encoded++
  self.postMessage({ type: MSG.GPU_PROGRESS, done: encoded })
  ack()
}

async function finalize() {
  await encoder.flush()
  encoder.close()
  muxer.finalize()
  const { buffer } = muxer.target
  self.postMessage({ type: MSG.GPU_DONE, buffer, frames: encoded }, [buffer])
}

self.onmessage = async (e) => {
  const msg = e.data
  try {
    if (msg.type === MSG.GPU_INIT) {
      port = msg.port
      port.onmessage = async (ev) => {
        const m = ev.data
        if (m.type === MSG.FRAME) {
          renderAndEncode(m.frame)
        } else if (m.type === MSG.EOS) {
          if (!eos) {
            eos = true
            await finalize()
          }
        }
      }
      await initGPU()
      return
    }
    if (msg.type === MSG.GPU_START) {
      cfg = msg.config
      cfg.keyInterval = Math.max(1, Math.round(cfg.fps * 2))
      setupEncoder()
      await configureEncoder()
      self.postMessage({ type: MSG.GPU_START })
      return
    }
  } catch (err) {
    self.postMessage({ type: MSG.GPU_ERROR, error: err?.message || String(err) })
  }
}
