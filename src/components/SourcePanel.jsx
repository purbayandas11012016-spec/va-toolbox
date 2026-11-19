import { useRef, useState } from 'react'
import { FileArrowUp, FileVideo, FilmStrip, X } from '@phosphor-icons/react'
import { Panel, Stat } from './ui.jsx'
import { bytes, duration } from '../lib/presets.js'

export function SourcePanel({ file, probe, disabled, onPick, onClear }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)

  const accept = (f) => f && onPick(f)

  return (
    <Panel icon={FilmStrip} title="Source" sub={probe ? `${probe.width}×${probe.height}` : 'local file'}>
      {!file ? (
        <button
          type="button"
          className={`drop${drag ? ' drag' : ''}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            accept(e.dataTransfer.files?.[0])
          }}
        >
          <span className="ico">
            <FileArrowUp size={30} weight="duotone" />
          </span>
          <strong>Drop a video or audio file</strong>
          <span>MP4, MOV, M4V, M4A, MP3, WAV, WebM — processed on-device</span>
        </button>
      ) : (
        <div className="file-row">
          <span className="ico">
            <FileVideo size={20} weight="duotone" />
          </span>
          <div className="file-meta">
            <b title={file.name}>{file.name}</b>
            <small>
              {bytes(file.size)}
              {probe ? ` · ${duration(probe.duration)} · ${probe.fps} fps` : ''}
            </small>
          </div>
          <button type="button" className="btn ghost icon" aria-label="Remove file" disabled={disabled} onClick={onClear}>
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,.mp4,.mov,.m4v,.webm,.mkv,.m4a,.mp3,.wav,.flac,.ogg"
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {probe && (
        <div className="stat-grid">
          <Stat label="Resolution" value={`${probe.width}×${probe.height}`} />
          <Stat label="Duration" value={duration(probe.duration)} />
          <Stat label="Frames" value={probe.frameCount || '—'} />
          <Stat label="Video codec" value={probe.codec.split('.')[0]} />
          <Stat label="Audio" value={probe.audio ? probe.audio.codec.split('.')[0].toUpperCase() : 'none'} />
          <Stat label="Sample rate" value={probe.audio?.sampleRate ? `${probe.audio.sampleRate} Hz` : '—'} />
        </div>
      )}
    </Panel>
  )
}
