import { CornersOut, SlidersHorizontal } from '@phosphor-icons/react'
import { Field, Panel, Segmented } from './ui.jsx'
import { RESOLUTIONS, SCALE_MODES, VIDEO_CODECS, targetSize } from '../lib/presets.js'

const QUALITY = [
  { id: 'auto', label: 'Auto' },
  { id: '2000', label: '2 Mbps' },
  { id: '6000', label: '6 Mbps' },
  { id: '16000', label: '16 Mbps' },
  { id: '45000', label: '45 Mbps' },
  { id: '120000', label: '120 Mbps' },
]

export function VideoPanel({ settings, onChange, probe, caps, disabled }) {
  const size = probe ? targetSize(probe.width, probe.height, settings.resolution, settings.custom) : null
  const limit = caps?.maxTexture || 8192
  const over = size ? Math.max(size.width, size.height) > limit : false

  return (
    <Panel icon={CornersOut} title="Video output" sub={size ? `${size.width}×${size.height}` : 'awaiting source'}>
      <Field label="Target resolution" hint={over ? `Exceeds this GPU's ${limit}px limit — reduce the target.` : 'Width follows the source aspect ratio.'}>
        <div className="chips">
          <button type="button" className="chip" data-on={settings.resolution === 'source'} disabled={disabled} onClick={() => onChange({ resolution: 'source' })}>
            <b>Source</b>
            <small>keep original</small>
          </button>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              data-on={settings.resolution === r.id}
              disabled={disabled}
              onClick={() => onChange({ resolution: r.id })}
            >
              <b>{r.label}</b>
              <small>{r.note}</small>
            </button>
          ))}
          <button type="button" className="chip" data-on={settings.resolution === 'custom'} disabled={disabled} onClick={() => onChange({ resolution: 'custom' })}>
            <b>Custom</b>
            <small>manual size</small>
          </button>
        </div>
      </Field>

      {settings.resolution === 'custom' && (
        <div className="grid-2">
          <Field label="Width">
            <input
              type="number"
              min="2"
              step="2"
              value={settings.custom.width}
              disabled={disabled}
              onChange={(e) => onChange({ custom: { ...settings.custom, width: Number(e.target.value) } })}
            />
          </Field>
          <Field label="Height">
            <input
              type="number"
              min="2"
              step="2"
              value={settings.custom.height}
              disabled={disabled}
              onChange={(e) => onChange({ custom: { ...settings.custom, height: Number(e.target.value) } })}
            />
          </Field>
        </div>
      )}

      <Field label="Scaling" hint="Fit adds solid bars, Fill crops, Stretch distorts — all done on the GPU.">
        <Segmented value={settings.scaleMode} onChange={(v) => onChange({ scaleMode: v })} options={SCALE_MODES} disabled={disabled} />
      </Field>

      <div className="grid-2">
        <Field label="Codec">
          <select value={settings.videoCodec.id} disabled={disabled} onChange={(e) => onChange({ videoCodec: VIDEO_CODECS.find((c) => c.id === e.target.value) })}>
            {VIDEO_CODECS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Container">
          <select value={settings.container} disabled={disabled} onChange={(e) => onChange({ container: e.target.value })}>
            <option value="mp4">MP4</option>
            <option value="mkv">Matroska (MKV)</option>
          </select>
        </Field>
      </div>

      <Field label="Bitrate" hint={settings.quality === 'auto' ? 'Auto scales with resolution and frame rate.' : undefined}>
        <Segmented value={String(settings.quality)} onChange={(v) => onChange({ quality: v === 'auto' ? 'auto' : Number(v) })} options={QUALITY.map((q) => ({ ...q, id: String(q.id) }))} disabled={disabled} />
      </Field>

      <Field label="Pipeline">
        <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={15} weight="duotone" />
          WebCodecs decode → WebGPU scale ({settings.scaleMode}) → WebCodecs encode → ffmpeg.wasm mux
        </div>
      </Field>
    </Panel>
  )
}
