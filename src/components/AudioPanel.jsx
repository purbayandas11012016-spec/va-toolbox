import { SpeakerHigh } from '@phosphor-icons/react'
import { Field, Panel, Segmented } from './ui.jsx'
import { AUDIO_BITRATES, AUDIO_FORMATS, CHANNELS, SAMPLE_RATES } from '../lib/presets.js'

export function AudioPanel({ settings, onChange, probe, disabled, audioOnly }) {
  const { audio } = settings
  const format = AUDIO_FORMATS.find((f) => f.id === audio.format) || AUDIO_FORMATS[0]
  const noTrack = !probe?.audio && !audioOnly

  return (
    <Panel icon={SpeakerHigh} title="Audio" sub={audioOnly ? `→ ${format.label}` : noTrack ? 'no track' : `→ ${format.label}`}>
      {!audioOnly && (
        <Field label="Include audio track" hint={noTrack ? 'The source has no audio stream; the export will be video-only.' : 'Re-encoding happens in ffmpeg.wasm.'}>
          <Segmented
            value={settings.audioEnabled ? 'on' : 'off'}
            onChange={(v) => onChange({ audioEnabled: v === 'on' })}
            options={[
              { id: 'on', label: 'On' },
              { id: 'off', label: 'Off' },
            ]}
            disabled={disabled || noTrack}
          />
        </Field>
      )}

      <div className="grid-2">
        <Field label="Format">
          <select value={audio.format} disabled={disabled} onChange={(e) => onChange({ audio: { ...audio, format: e.target.value } })}>
            {AUDIO_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Channels">
          <select value={audio.channels} disabled={disabled} onChange={(e) => onChange({ audio: { ...audio, channels: Number(e.target.value) } })}>
            {CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Sample rate">
        <select value={audio.sampleRate} disabled={disabled} onChange={(e) => onChange({ audio: { ...audio, sampleRate: Number(e.target.value) } })}>
          <option value={0}>Source</option>
          {SAMPLE_RATES.map((s) => (
            <option key={s} value={s}>
              {s} Hz
            </option>
          ))}
        </select>
      </Field>

      <Field label="Bitrate" hint={format.lossless ? 'Lossless codecs ignore bitrate.' : 'CBR target bitrate for the encoder.'}>
        <Segmented
          value={String(audio.bitrate)}
          onChange={(v) => onChange({ audio: { ...audio, bitrate: Number(v) } })}
          options={AUDIO_BITRATES.map((b) => ({ id: String(b), label: `${b}k` }))}
          disabled={disabled || format.lossless}
        />
      </Field>
    </Panel>
  )
}
