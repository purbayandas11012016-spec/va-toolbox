import { useCallback, useMemo, useState } from 'react'
import { CornersIn, Cpu, Cube, SlidersHorizontal, Van } from '@phosphor-icons/react'
import { ToastProvider, useToast } from './components/Toast.jsx'
import { SourcePanel } from './components/SourcePanel.jsx'
import { VideoPanel } from './components/VideoPanel.jsx'
import { AudioPanel } from './components/AudioPanel.jsx'
import { RunPanel } from './components/RunPanel.jsx'
import { OutputPanel } from './components/OutputPanel.jsx'
import { Panel, Segmented } from './components/ui.jsx'
import { useProcessor } from './lib/useProcessor.js'
import { AUDIO_FORMATS, VIDEO_CODECS, targetSize } from './lib/presets.js'

const DEFAULTS = {
  mode: 'video',
  resolution: '1080p',
  custom: { width: 1920, height: 1080 },
  scaleMode: 'contain',
  videoCodec: VIDEO_CODECS[0],
  quality: 'auto',
  container: 'mp4',
  audioEnabled: true,
  audio: { format: 'aac', bitrate: 192, sampleRate: 48000, channels: 2 },
}

function Chip({ ok, icon: Icon, label }) {
  return (
    <span className={`cap ${ok ? 'on' : 'off'}`}>
      <Icon size={13} weight="fill" />
      {label}
    </span>
  )
}

function Workbench() {
  const toast = useToast()
  const { ready, caps, threaded, busy, stage, counts, output, probe, run, cancel } = useProcessor(toast)
  const [file, setFile] = useState(null)
  const [info, setInfo] = useState(null)
  const [settings, setSettings] = useState(DEFAULTS)

  const supported = typeof window !== 'undefined' && 'VideoDecoder' in window && !!navigator.gpu
  const patch = useCallback((p) => setSettings((s) => ({ ...s, ...p })), [])

  const onPick = useCallback(
    async (f) => {
      if (!f) return
      if (!supported) return toast.error('Browser unsupported', 'This tool needs WebCodecs and WebGPU. Use a recent Chrome or Edge.')
      if (f.size > 3 * 1024 ** 3) return toast.error('File too large', 'Files above 3 GB exceed practical in-memory limits.')
      setFile(f)
      setInfo(null)
      try {
        const p = await probe(f)
        setInfo(p)
        setSettings((s) => ({
          ...s,
          audioEnabled: !!p.audio,
          audio: { ...s.audio, sampleRate: p.audio?.sampleRate || s.audio.sampleRate, channels: Math.min(p.audio?.channels || 2, 2) },
          custom: { width: p.width, height: p.height },
        }))
        toast.info('Source ready', `${p.width}×${p.height} · ${p.fps} fps · ${p.frameCount} frames`)
      } catch (e) {
        setFile(null)
        toast.error('Could not read file', e.message)
      }
    },
    [probe, supported, toast],
  )

  const onClear = useCallback(() => {
    setFile(null)
    setInfo(null)
  }, [])

  const audioOnly = settings.mode === 'audio'
  const size = info ? targetSize(info.width, info.height, settings.resolution, settings.custom) : null
  const overLimit = size && caps ? Math.max(size.width, size.height) > caps.maxTexture : false
  const canRun = !!info && !overLimit

  const onRun = useCallback(() => {
    if (!info) return
    if (settings.mode === 'audio' && !info.audio) return toast.error('No audio stream', 'This file has no audio track to convert.')
    const fmt = AUDIO_FORMATS.find((f) => f.id === settings.audio.format) || AUDIO_FORMATS[0]
    const audioJob = { ...settings.audio, codec: fmt.codec, ext: fmt.ext, lossless: fmt.lossless }
    run({
      mode: settings.mode,
      resolution: settings.resolution,
      custom: settings.custom,
      scaleMode: settings.scaleMode,
      videoCodec: settings.videoCodec,
      quality: settings.quality,
      container: settings.container,
      audioEnabled: settings.audioEnabled,
      audio: audioJob,
    })
  }, [info, run, settings])

  const capsChips = useMemo(
    () => [
      { ok: !!navigator.gpu, icon: Cube, label: 'WebGPU' },
      { ok: 'VideoDecoder' in window, icon: Cpu, label: 'WebCodecs' },
      { ok: threaded, icon: Van, label: threaded ? 'ffmpeg.wasm MT' : 'ffmpeg.wasm ST' },
    ],
    [threaded],
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <CornersIn size={21} weight="bold" />
          </span>
          <div>
            <h1>VA Toolbox</h1>
            <p>Local video &amp; audio processor · 144p → 16K</p>
          </div>
        </div>
        <div className="topbar-actions">
          {capsChips.map((c) => (
            <Chip key={c.label} {...c} />
          ))}
        </div>
      </header>

      <main className="workbench">
        <div className="column">
          <SourcePanel file={file} probe={info} disabled={busy} onPick={onPick} onClear={onClear} />
          <Panel icon={SlidersHorizontal} title="Output mode">
            <Segmented
              value={settings.mode}
              onChange={(v) => patch({ mode: v })}
              options={[
                { id: 'video', label: 'Video + audio' },
                { id: 'audio', label: 'Audio only' },
              ]}
              disabled={busy}
            />
          </Panel>
          {!audioOnly && <VideoPanel settings={settings} onChange={patch} probe={info} caps={caps} disabled={busy} />}
          <AudioPanel settings={settings} onChange={patch} probe={info} disabled={busy} audioOnly={audioOnly} />
        </div>

        <div className="column">
          <RunPanel ready={ready} busy={busy} stage={stage} counts={counts} audioOnly={audioOnly} canRun={canRun} onRun={onRun} onCancel={cancel} />
          <OutputPanel output={output} onReset={onClear} />
        </div>
      </main>

      <p className="foot">
        Decoding, scaling, encoding and muxing all run in background workers on this device. No uploads, no backend.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Workbench />
    </ToastProvider>
  )
}
